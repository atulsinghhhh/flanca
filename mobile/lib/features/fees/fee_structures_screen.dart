import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/auth/auth_state.dart';
import '../../core/format.dart';
import '../../core/network/api_exception.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/app_widgets.dart';

final _feeStructuresProvider = FutureProvider.autoDispose((ref) async {
  final api = ref.watch(apiClientProvider);
  return api.get<Map<String, dynamic>>('/fees/structures');
});

enum _Section { classes, heads }

/// Mirrors src/app/app/fees/structures/page.tsx: what the school charges
/// (fee heads) and how much each class pays for the current academic year.
/// The web page's Terms/Concessions/Late-fee side panels stay web-only —
/// this screen is the two things a MONEY-role person needs on the go: check
/// or edit a class's price, and manage the fee heads themselves.
class FeeStructuresScreen extends ConsumerStatefulWidget {
  const FeeStructuresScreen({super.key});

  @override
  ConsumerState<FeeStructuresScreen> createState() => _FeeStructuresScreenState();
}

class _FeeStructuresScreenState extends ConsumerState<FeeStructuresScreen> {
  _Section _section = _Section.classes;

  Future<void> _addHead() async {
    final saved = await showAppFormSheet<bool>(context, builder: (_) => const _FeeHeadFormSheet());
    if (saved == true) ref.invalidate(_feeStructuresProvider);
  }

  @override
  Widget build(BuildContext context) {
    final result = ref.watch(_feeStructuresProvider);

    return Scaffold(
      appBar: AppTopBar(
        title: 'Fee structure',
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(52),
          child: Padding(
            padding: const EdgeInsets.only(bottom: AppSpacing.sm),
            child: AppFilterBar(
              labels: const ['By class', 'Fee heads'],
              selectedIndex: _Section.values.indexOf(_section),
              onSelected: (index) => setState(() => _section = _Section.values[index]),
            ),
          ),
        ),
      ),
      floatingActionButton: _section == _Section.heads
          ? AppFab(icon: Icons.add_rounded, label: 'Fee head', onPressed: _addHead)
          : null,
      body: RefreshIndicator(
        onRefresh: () async => ref.invalidate(_feeStructuresProvider),
        child: result.when(
          loading: () => const AppCardsSkeleton(),
          error: (err, _) => ErrorView(error: err, onRetry: () => ref.invalidate(_feeStructuresProvider)),
          data: (data) {
            final year = data['year'] as Map<String, dynamic>?;
            final heads = (data['heads'] as List).cast<Map<String, dynamic>>();
            final classes = (data['classes'] as List).cast<Map<String, dynamic>>();
            final structures = (data['structures'] as List).cast<Map<String, dynamic>>();

            if (year == null) {
              return const EmptyState(
                icon: Icons.event_busy_outlined,
                title: 'No current academic year',
                message: 'Fees are priced for a year. Mark one as current on the web app before setting them.',
              );
            }

            final amountsByClass = <String, Map<String, int>>{};
            for (final s in structures) {
              final classId = s['classId'] as String?;
              if (classId == null) continue;
              final at = amountsByClass.putIfAbsent(classId, () => {});
              for (final item in (s['items'] as List).cast<Map<String, dynamic>>()) {
                final headId = item['feeHeadId'] as String;
                at[headId] = (at[headId] ?? 0) + (item['amount'] as int? ?? 0);
              }
            }

            return _section == _Section.classes
                ? _ClassesTab(
                    yearName: year['name'] as String,
                    classes: classes,
                    heads: heads,
                    amountsByClass: amountsByClass,
                    onEdited: () => ref.invalidate(_feeStructuresProvider),
                  )
                : _HeadsTab(heads: heads, onChanged: () => ref.invalidate(_feeStructuresProvider));
          },
        ),
      ),
    );
  }
}

class _ClassesTab extends StatelessWidget {
  const _ClassesTab({
    required this.yearName,
    required this.classes,
    required this.heads,
    required this.amountsByClass,
    required this.onEdited,
  });

  final String yearName;
  final List<Map<String, dynamic>> classes;
  final List<Map<String, dynamic>> heads;
  final Map<String, Map<String, int>> amountsByClass;
  final VoidCallback onEdited;

  @override
  Widget build(BuildContext context) {
    if (heads.isEmpty) {
      return const EmptyState(
        icon: Icons.receipt_long_outlined,
        title: 'No fee heads yet',
        message: 'Add a fee head — Tuition Fee, Examination Fee, Transport — then price it per class.',
      );
    }
    if (classes.isEmpty) {
      return const EmptyState(icon: Icons.groups_outlined, title: 'No classes yet', message: 'Add classes on the web app first.');
    }

    final unpriced = classes.where((c) => (amountsByClass[c['id']]?.values.fold(0, (a, n) => a + n) ?? 0) == 0).length;

    return ListView(
      padding: const EdgeInsets.fromLTRB(AppSpacing.page, AppSpacing.sm, AppSpacing.page, AppSpacing.xxl),
      children: [
        Padding(
          padding: const EdgeInsets.only(bottom: AppSpacing.sm),
          child: Text(
            unpriced == 0
                ? 'Every class is priced for $yearName.'
                : '$unpriced of ${classes.length} classes still at zero for $yearName.',
            style: const TextStyle(color: AppColors.ink3, fontSize: 12.5),
          ),
        ),
        AppSurface(
          clip: true,
          child: ListView.separated(
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            itemCount: classes.length,
            separatorBuilder: (_, _) => const Divider(height: 1, indent: AppSpacing.page, endIndent: AppSpacing.page),
            itemBuilder: (context, index) {
              final cls = classes[index];
              final amounts = amountsByClass[cls['id']] ?? const {};
              final total = amounts.values.fold(0, (a, n) => a + n);
              return AppListRow(
                title: cls['name'] as String,
                subtitle: '${cls['students']} student${cls['students'] == 1 ? '' : 's'}',
                showChevron: true,
                trailing: Text(
                  formatMoney(total),
                  style: TextStyle(
                    fontWeight: FontWeight.w700,
                    fontSize: 14.5,
                    color: total == 0 ? AppColors.ink3 : AppColors.ink,
                  ),
                ),
                onTap: () async {
                  final saved = await showAppFormSheet<bool>(
                    context,
                    builder: (_) => _ClassFeeFormSheet(
                      classId: cls['id'] as String,
                      className: cls['name'] as String,
                      heads: heads,
                      amounts: amounts,
                    ),
                  );
                  if (saved == true) onEdited();
                },
              );
            },
          ),
        ),
      ],
    );
  }
}

class _ClassFeeFormSheet extends ConsumerStatefulWidget {
  const _ClassFeeFormSheet({
    required this.classId,
    required this.className,
    required this.heads,
    required this.amounts,
  });

  final String classId;
  final String className;
  final List<Map<String, dynamic>> heads;
  final Map<String, int> amounts;

  @override
  ConsumerState<_ClassFeeFormSheet> createState() => _ClassFeeFormSheetState();
}

class _ClassFeeFormSheetState extends ConsumerState<_ClassFeeFormSheet> {
  late final _controllers = {
    for (final h in widget.heads)
      h['id'] as String: TextEditingController(
        text: (widget.amounts[h['id']] ?? 0) == 0 ? '' : ((widget.amounts[h['id']]!) / 100).toStringAsFixed(2),
      ),
  };
  bool _saving = false;
  String? _error;

  @override
  void dispose() {
    for (final c in _controllers.values) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _submit() async {
    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      final api = ref.read(apiClientProvider);
      await api.post<Map<String, dynamic>>('/fees/structures/class-fees', data: {
        'classId': widget.classId,
        'amounts': {for (final e in _controllers.entries) e.key: e.value.text.trim()},
      });
      if (mounted) Navigator.of(context).pop(true);
    } on ApiException catch (e) {
      setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final total = _controllers.values.fold<double>(0, (a, c) => a + (double.tryParse(c.text.trim()) ?? 0));

    return AppFormSheet(
      title: widget.className,
      subtitle: 'Annual fee, per head',
      actions: [
        OutlinedButton(
          onPressed: _saving ? null : () => Navigator.of(context).pop(false),
          child: const Text('Cancel'),
        ),
        AppSubmitButton(label: 'Save', busy: _saving, onPressed: _submit),
      ],
      child: StatefulBuilder(
        builder: (context, setSheetState) => Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          mainAxisSize: MainAxisSize.min,
          children: [
            for (final h in widget.heads) ...[
              TextField(
                controller: _controllers[h['id']],
                keyboardType: const TextInputType.numberWithOptions(decimal: true),
                onChanged: (_) => setSheetState(() {}),
                decoration: InputDecoration(
                  labelText: (h['name'] as String) + ((h['isOptional'] as bool? ?? false) ? ' (optional)' : ''),
                  prefixText: '₹ ',
                ),
              ),
              const SizedBox(height: AppSpacing.md),
            ],
            const Divider(),
            const SizedBox(height: AppSpacing.sm),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                const Text('Annual total', style: TextStyle(fontWeight: FontWeight.w600)),
                Text(
                  formatMoney((total * 100).round()),
                  style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16),
                ),
              ],
            ),
            if (_error != null) ...[
              const SizedBox(height: AppSpacing.lg),
              AppErrorBanner(_error!),
            ],
          ],
        ),
      ),
    );
  }
}

class _HeadsTab extends ConsumerWidget {
  const _HeadsTab({required this.heads, required this.onChanged});

  final List<Map<String, dynamic>> heads;
  final VoidCallback onChanged;

  Future<void> _move(WidgetRef ref, BuildContext context, String feeHeadId, String direction) async {
    try {
      final api = ref.read(apiClientProvider);
      await api.post<Map<String, dynamic>>('/fees/structures/$feeHeadId/move', data: {'direction': direction});
      onChanged();
    } on ApiException catch (e) {
      if (context.mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
    }
  }

  Future<void> _delete(WidgetRef ref, BuildContext context, Map<String, dynamic> head) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        title: Text('Delete ${head['name']}?'),
        content: const Text('This cannot be undone.'),
        actions: [
          TextButton(onPressed: () => Navigator.of(context).pop(false), child: const Text('Cancel')),
          FilledButton(onPressed: () => Navigator.of(context).pop(true), child: const Text('Delete')),
        ],
      ),
    );
    if (confirmed != true) return;
    try {
      final api = ref.read(apiClientProvider);
      await api.delete<Map<String, dynamic>>('/fees/structures/${head['id']}');
      onChanged();
    } on ApiException catch (e) {
      if (context.mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    if (heads.isEmpty) {
      return const EmptyState(
        icon: Icons.receipt_long_outlined,
        title: 'No fee heads yet',
        message: 'Start with what the school charges for — Tuition Fee, Examination Fee, Transport.',
      );
    }

    return ListView(
      padding: const EdgeInsets.fromLTRB(AppSpacing.page, AppSpacing.sm, AppSpacing.page, AppSpacing.xxl),
      children: [
        AppSurface(
          clip: true,
          child: ListView.separated(
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            itemCount: heads.length,
            separatorBuilder: (_, _) => const Divider(height: 1, indent: AppSpacing.page, endIndent: AppSpacing.page),
            itemBuilder: (context, index) {
              final head = heads[index];
              final canDelete = head['canDelete'] as bool? ?? false;
              return AppListRow(
                title: head['name'] as String,
                subtitle: [
                  if ((head['code'] as String?)?.isNotEmpty ?? false) head['code'] as String,
                  '${head['classesCharging']} class${head['classesCharging'] == 1 ? '' : 'es'} charging',
                  if (head['isOptional'] as bool? ?? false) 'optional',
                ].join(' · '),
                trailing: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    IconButton(
                      icon: const Icon(Icons.arrow_upward_rounded, size: 18),
                      visualDensity: VisualDensity.compact,
                      onPressed: index == 0 ? null : () => _move(ref, context, head['id'] as String, 'UP'),
                    ),
                    IconButton(
                      icon: const Icon(Icons.arrow_downward_rounded, size: 18),
                      visualDensity: VisualDensity.compact,
                      onPressed: index == heads.length - 1 ? null : () => _move(ref, context, head['id'] as String, 'DOWN'),
                    ),
                    IconButton(
                      icon: const Icon(Icons.edit_outlined, size: 18),
                      visualDensity: VisualDensity.compact,
                      onPressed: () async {
                        final saved = await showAppFormSheet<bool>(
                          context,
                          builder: (_) => _FeeHeadFormSheet(head: head),
                        );
                        if (saved == true) onChanged();
                      },
                    ),
                    IconButton(
                      icon: const Icon(Icons.delete_outline_rounded, size: 18),
                      visualDensity: VisualDensity.compact,
                      color: canDelete ? AppColors.overdue : AppColors.line2,
                      onPressed: canDelete
                          ? () => _delete(ref, context, head)
                          : () => ScaffoldMessenger.of(context).showSnackBar(
                                SnackBar(content: Text(head['cannotDeleteReason'] as String? ?? 'Cannot delete this fee head.')),
                              ),
                    ),
                  ],
                ),
              );
            },
          ),
        ),
      ],
    );
  }
}

/// Add or edit a fee head. `head` null means "add"; supplying it pre-fills
/// the fields and PATCHes instead of POSTing.
class _FeeHeadFormSheet extends ConsumerStatefulWidget {
  const _FeeHeadFormSheet({this.head});

  final Map<String, dynamic>? head;

  @override
  ConsumerState<_FeeHeadFormSheet> createState() => _FeeHeadFormSheetState();
}

class _FeeHeadFormSheetState extends ConsumerState<_FeeHeadFormSheet> {
  late final _nameController = TextEditingController(text: widget.head?['name'] as String? ?? '');
  late final _codeController = TextEditingController(text: widget.head?['code'] as String? ?? '');
  late bool _isOptional = widget.head?['isOptional'] as bool? ?? false;
  late bool _isRefundable = widget.head?['isRefundable'] as bool? ?? false;
  bool _saving = false;
  String? _error;

  @override
  void dispose() {
    _nameController.dispose();
    _codeController.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final name = _nameController.text.trim();
    if (name.isEmpty) {
      setState(() => _error = 'Enter a name for this fee head.');
      return;
    }
    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      final api = ref.read(apiClientProvider);
      final body = {
        'name': name,
        'code': _codeController.text.trim().isEmpty ? null : _codeController.text.trim(),
        'isOptional': _isOptional,
        'isRefundable': _isRefundable,
      };
      if (widget.head == null) {
        await api.post<Map<String, dynamic>>('/fees/structures', data: body);
      } else {
        await api.patch<Map<String, dynamic>>('/fees/structures/${widget.head!['id']}', data: body);
      }
      if (mounted) Navigator.of(context).pop(true);
    } on ApiException catch (e) {
      setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return AppFormSheet(
      title: widget.head == null ? 'Add a fee head' : 'Edit fee head',
      actions: [
        OutlinedButton(
          onPressed: _saving ? null : () => Navigator.of(context).pop(false),
          child: const Text('Cancel'),
        ),
        AppSubmitButton(label: 'Save', busy: _saving, onPressed: _submit),
      ],
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        mainAxisSize: MainAxisSize.min,
        children: [
          TextField(controller: _nameController, decoration: const InputDecoration(labelText: 'Name')),
          const SizedBox(height: AppSpacing.md),
          TextField(controller: _codeController, decoration: const InputDecoration(labelText: 'Code (optional)')),
          const SizedBox(height: AppSpacing.sm),
          SwitchListTile.adaptive(
            contentPadding: EdgeInsets.zero,
            title: const Text('Optional'),
            subtitle: const Text('Charged only to those who opt in'),
            value: _isOptional,
            onChanged: (v) => setState(() => _isOptional = v),
          ),
          SwitchListTile.adaptive(
            contentPadding: EdgeInsets.zero,
            title: const Text('Refundable'),
            value: _isRefundable,
            onChanged: (v) => setState(() => _isRefundable = v),
          ),
          if (_error != null) ...[
            const SizedBox(height: AppSpacing.md),
            AppErrorBanner(_error!),
          ],
        ],
      ),
    );
  }
}
