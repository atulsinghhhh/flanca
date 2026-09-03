import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/auth/auth_state.dart';
import '../../core/network/api_exception.dart';
import '../../core/format.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/app_widgets.dart';

final stockItemsProvider = FutureProvider((ref) async {
  final api = ref.watch(apiClientProvider);
  final data = await api.get<Map<String, dynamic>>('/stock/items');
  return (data['items'] as List).cast<Map<String, dynamic>>();
});

const _movementKinds = ['IN', 'OUT', 'ADJUST'];

/// The store cupboard, office-only. Mirrors src/app/app/stock/page.tsx's item
/// table: name, group, quantity vs reorder point, and the two things that
/// keep the number honest — adding a new item and recording a movement
/// (delivery in / issue out / correction after counting the shelf).
class StockScreen extends ConsumerStatefulWidget {
  const StockScreen({super.key});

  @override
  ConsumerState<StockScreen> createState() => _StockScreenState();
}

class _StockScreenState extends ConsumerState<StockScreen> {
  final _searchController = TextEditingController();
  String _query = '';
  bool _lowStockOnly = false;

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final items = ref.watch(stockItemsProvider);

    return Scaffold(
      appBar: AppTopBar(title: 'Stock'),
      floatingActionButton: AppFab(
        tooltip: 'New item',
        icon: Icons.add_rounded,
        onPressed: () => _openItemForm(context, ref),
      ),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(
              AppSpacing.page,
              AppSpacing.xs,
              AppSpacing.page,
              AppSpacing.sm,
            ),
            child: AppSearchField(
              controller: _searchController,
              hintText: 'Name, group or supplier',
              onChanged: (value) => setState(() => _query = value),
              textInputAction: TextInputAction.search,
            ),
          ),
          Padding(
            padding: const EdgeInsets.only(bottom: AppSpacing.sm),
            child: AppFilterBar(
              labels: const ['All', 'Low stock'],
              selectedIndex: _lowStockOnly ? 1 : 0,
              onSelected: (index) => setState(() => _lowStockOnly = index == 1),
            ),
          ),
          Expanded(
            child: RefreshIndicator(
              onRefresh: () async => ref.invalidate(stockItemsProvider),
              child: items.when(
                loading: () => const AppListSkeleton(rows: 8),
                error: (err, _) => ErrorView(
                  error: err,
                  onRetry: () => ref.invalidate(stockItemsProvider),
                ),
                data: (all) {
                  final q = _query.trim().toLowerCase();
                  final rows = all.where((item) {
                    if (_lowStockOnly && item['lowStock'] != true) return false;
                    if (q.isEmpty) return true;
                    final haystack =
                        '${item['name']} ${item['group'] ?? ''} ${item['supplier'] ?? ''}'
                            .toLowerCase();
                    return haystack.contains(q);
                  }).toList();

                  if (rows.isEmpty) {
                    return ListView(
                      children: [
                        EmptyState(
                          icon: Icons.inventory_2_outlined,
                          title: all.isEmpty ? 'No stock items' : 'No matches',
                          message: all.isEmpty
                              ? 'Items added to the store will be listed here.'
                              : 'Try a different search or filter.',
                        ),
                      ],
                    );
                  }
                  return ListView.separated(
                    padding: const EdgeInsets.only(
                      top: AppSpacing.sm,
                      bottom: AppSpacing.bottomSafe,
                    ),
                    itemCount: rows.length,
                    separatorBuilder: (_, _) => const Divider(
                      height: 1,
                      indent: AppSpacing.page,
                      endIndent: AppSpacing.page,
                    ),
                    itemBuilder: (context, index) =>
                        _StockItemTile(item: rows[index]),
                  );
                },
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _StockItemTile extends ConsumerWidget {
  const _StockItemTile({required this.item});

  final Map<String, dynamic> item;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final quantity = item['quantity'] as int;
    final unit = item['unit'] as String;
    final reorderAt = item['reorderAt'] as int?;
    final lowStock = item['lowStock'] as bool? ?? false;
    final group = item['group'] as String?;
    final supplier = item['supplier'] as String?;
    final unitPrice = item['unitPrice'] as int?;

    return AppListRow(
      title: item['name'] as String,
      subtitle: [
        if (group != null && group.isNotEmpty) group,
        if (supplier != null && supplier.isNotEmpty) 'from $supplier',
        if (unitPrice != null) '${formatMoney(unitPrice)}/$unit',
        if (reorderAt != null) 'reorder at $reorderAt $unit',
      ].join(' · '),
      trailing: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          ToneBadge(
            '$quantity $unit',
            tone: lowStock ? Tone.warn : Tone.neutral,
          ),
          PopupMenuButton<String>(
            onSelected: (action) {
              if (action == 'edit') _openItemForm(context, ref, item: item);
              if (action == 'movement') {
                _openMovementForm(context, ref, item: item);
              }
            },
            itemBuilder: (context) => const [
              PopupMenuItem(value: 'movement', child: Text('Record movement')),
              PopupMenuItem(value: 'edit', child: Text('Edit item')),
            ],
          ),
        ],
      ),
      onTap: () => _openMovementForm(context, ref, item: item),
    );
  }
}

Future<void> _openItemForm(
  BuildContext context,
  WidgetRef ref, {
  Map<String, dynamic>? item,
}) async {
  await showAppFormSheet<void>(
    context,
    builder: (_) => _ItemFormDialog(item: item),
  );
}

Future<void> _openMovementForm(
  BuildContext context,
  WidgetRef ref, {
  required Map<String, dynamic> item,
}) async {
  await showAppFormSheet<void>(
    context,
    builder: (_) => _MovementFormDialog(item: item),
  );
}

class _ItemFormDialog extends ConsumerStatefulWidget {
  const _ItemFormDialog({this.item});

  final Map<String, dynamic>? item;

  @override
  ConsumerState<_ItemFormDialog> createState() => _ItemFormDialogState();
}

class _ItemFormDialogState extends ConsumerState<_ItemFormDialog> {
  late final _name = TextEditingController(
    text: widget.item?['name'] as String? ?? '',
  );
  late final _group = TextEditingController(
    text: widget.item?['group'] as String? ?? '',
  );
  late final _unit = TextEditingController(
    text: widget.item?['unit'] as String? ?? '',
  );
  late final _reorderAt = TextEditingController(
    text: (widget.item?['reorderAt'] as int?)?.toString() ?? '',
  );
  late final _unitPriceText = TextEditingController();
  late final _supplier = TextEditingController(
    text: widget.item?['supplier'] as String? ?? '',
  );
  final _openingQuantity = TextEditingController();
  bool _saving = false;
  String? _error;

  bool get _isEdit => widget.item != null;

  @override
  void dispose() {
    _name.dispose();
    _group.dispose();
    _unit.dispose();
    _reorderAt.dispose();
    _unitPriceText.dispose();
    _supplier.dispose();
    _openingQuantity.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      final api = ref.read(apiClientProvider);
      await api.post<Map<String, dynamic>>(
        '/stock/items',
        data: {
          if (_isEdit) 'itemId': widget.item!['id'],
          'name': _name.text.trim(),
          'group': _group.text.trim().isEmpty ? null : _group.text.trim(),
          'unit': _unit.text.trim(),
          'reorderAt': int.tryParse(_reorderAt.text.trim()),
          'unitPriceText': _unitPriceText.text.trim().isEmpty
              ? null
              : _unitPriceText.text.trim(),
          'supplier': _supplier.text.trim().isEmpty
              ? null
              : _supplier.text.trim(),
          if (!_isEdit)
            'openingQuantity': int.tryParse(_openingQuantity.text.trim()),
        },
      );
      ref.invalidate(stockItemsProvider);
      if (mounted) Navigator.of(context).pop();
    } on ApiException catch (e) {
      setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return AppFormSheet(
      title: _isEdit ? 'Edit item' : 'Add item',
      subtitle: _isEdit
          ? widget.item!['name'] as String?
          : 'A new line in the stock register',
      actions: [
        OutlinedButton(
          onPressed: _saving ? null : () => Navigator.of(context).pop(),
          child: const Text('Cancel'),
        ),
        AppSubmitButton(label: 'Save', busy: _saving, onPressed: _submit),
      ],
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        mainAxisSize: MainAxisSize.min,
        children: [
          TextField(
            controller: _name,
            decoration: const InputDecoration(labelText: 'Name'),
          ),
          const SizedBox(height: AppSpacing.md),
          TextField(
            controller: _group,
            decoration: const InputDecoration(labelText: 'Group (optional)'),
          ),
          const SizedBox(height: AppSpacing.md),
          TextField(
            controller: _unit,
            decoration: const InputDecoration(
              labelText: 'Unit (e.g. pcs, box)',
            ),
          ),
          const SizedBox(height: AppSpacing.md),
          TextField(
            controller: _reorderAt,
            keyboardType: TextInputType.number,
            decoration: const InputDecoration(
              labelText: 'Reorder at (optional)',
            ),
          ),
          const SizedBox(height: AppSpacing.md),
          TextField(
            controller: _unitPriceText,
            decoration: const InputDecoration(
              labelText: 'Unit price, e.g. 45.50 (optional)',
            ),
          ),
          const SizedBox(height: AppSpacing.md),
          TextField(
            controller: _supplier,
            decoration: const InputDecoration(labelText: 'Supplier (optional)'),
          ),
          if (!_isEdit) ...[
            const SizedBox(height: AppSpacing.md),
            TextField(
              controller: _openingQuantity,
              keyboardType: TextInputType.number,
              decoration: const InputDecoration(
                labelText: 'Opening quantity (optional)',
              ),
            ),
          ],
          if (_error != null) ...[
            const SizedBox(height: AppSpacing.lg),
            AppErrorBanner(_error!),
          ],
        ],
      ),
    );
  }
}

class _MovementFormDialog extends ConsumerStatefulWidget {
  const _MovementFormDialog({required this.item});

  final Map<String, dynamic> item;

  @override
  ConsumerState<_MovementFormDialog> createState() =>
      _MovementFormDialogState();
}

class _MovementFormDialogState extends ConsumerState<_MovementFormDialog> {
  String _kind = 'IN';
  final _quantity = TextEditingController();
  final _reason = TextEditingController();
  final _billNo = TextEditingController();
  bool _saving = false;
  String? _error;

  @override
  void dispose() {
    _quantity.dispose();
    _reason.dispose();
    _billNo.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final quantity = int.tryParse(_quantity.text.trim());
    if (quantity == null || quantity <= 0) {
      setState(() => _error = 'Enter a quantity greater than zero.');
      return;
    }
    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      final api = ref.read(apiClientProvider);
      await api.post<Map<String, dynamic>>(
        '/stock/items/${widget.item['id']}/movements',
        data: {
          'kind': _kind,
          'quantity': quantity,
          'reason': _reason.text.trim().isEmpty ? null : _reason.text.trim(),
          'billNo': _billNo.text.trim().isEmpty ? null : _billNo.text.trim(),
        },
      );
      ref.invalidate(stockItemsProvider);
      if (mounted) Navigator.of(context).pop();
    } on ApiException catch (e) {
      setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return AppFormSheet(
      title: 'Record movement',
      subtitle: widget.item['name'] as String?,
      actions: [
        OutlinedButton(
          onPressed: _saving ? null : () => Navigator.of(context).pop(),
          child: const Text('Cancel'),
        ),
        AppSubmitButton(label: 'Save', busy: _saving, onPressed: _submit),
      ],
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          SegmentedButton<String>(
            segments: _movementKinds
                .map((k) => ButtonSegment(value: k, label: Text(k)))
                .toList(),
            selected: {_kind},
            onSelectionChanged: (selection) =>
                setState(() => _kind = selection.first),
          ),
          const SizedBox(height: AppSpacing.lg),
          TextField(
            controller: _quantity,
            keyboardType: TextInputType.number,
            decoration: const InputDecoration(labelText: 'Quantity'),
          ),
          const SizedBox(height: AppSpacing.md),
          TextField(
            controller: _reason,
            decoration: InputDecoration(
              labelText: _kind == 'ADJUST'
                  ? 'Reason (required for a correction)'
                  : 'Reason (optional)',
            ),
          ),
          const SizedBox(height: AppSpacing.md),
          TextField(
            controller: _billNo,
            decoration: const InputDecoration(labelText: 'Bill no. (optional)'),
          ),
          if (_error != null) ...[
            const SizedBox(height: AppSpacing.lg),
            AppErrorBanner(_error!),
          ],
        ],
      ),
    );
  }
}
