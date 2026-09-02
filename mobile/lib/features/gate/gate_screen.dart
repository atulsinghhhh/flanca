import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/auth/auth_state.dart';
import '../../core/network/api_exception.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/app_widgets.dart';

final _gateVisitorsProvider = FutureProvider.autoDispose((ref) async {
  final api = ref.watch(apiClientProvider);
  return api.get<Map<String, dynamic>>('/gate/visitors');
});

final _gatePassesProvider = FutureProvider.autoDispose((ref) async {
  final api = ref.watch(apiClientProvider);
  return api.get<Map<String, dynamic>>('/gate/passes');
});

String _clockOf(String iso) {
  final t = DateTime.parse(iso).toLocal();
  final h = t.hour;
  final period = h >= 12 ? 'PM' : 'AM';
  final h12 = h % 12 == 0 ? 12 : h % 12;
  return '$h12:${t.minute.toString().padLeft(2, '0')} $period';
}

/// Mirrors src/app/app/gate: today's visitor log for a guard standing at the
/// gate — who's inside right now, log a new visitor in on arrival, sign them
/// out on departure, and issue a student gate pass for early release.
class GateScreen extends ConsumerStatefulWidget {
  const GateScreen({super.key});

  @override
  ConsumerState<GateScreen> createState() => _GateScreenState();
}

class _GateScreenState extends ConsumerState<GateScreen> {
  bool _busy = false;
  final _searchController = TextEditingController();
  String _query = '';
  bool _insideOnly = false;

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  Future<void> _signOut(String visitorId) async {
    setState(() => _busy = true);
    try {
      final api = ref.read(apiClientProvider);
      await api.post('/gate/visitors/$visitorId/sign-out');
      ref.invalidate(_gateVisitorsProvider);
    } on ApiException catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(e.message)));
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _logVisitor() async {
    final nameController = TextEditingController();
    final phoneController = TextEditingController();
    final purposeController = TextEditingController();
    final whomController = TextEditingController();
    final idProofController = TextEditingController();

    final confirmed = await showAppFormSheet<bool>(
      context,
      builder: (context) => AppFormSheet(
        title: 'Log visitor',
        subtitle: 'Sign someone in at the gate',
        actions: [
          OutlinedButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Cancel'),
          ),
          AppSubmitButton(
            label: 'Log in',
            onPressed: () => Navigator.pop(context, true),
          ),
        ],
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          mainAxisSize: MainAxisSize.min,
          children: [
            TextField(
              controller: nameController,
              textCapitalization: TextCapitalization.words,
              decoration: const InputDecoration(labelText: 'Name'),
              autofocus: true,
            ),
            const SizedBox(height: AppSpacing.md),
            TextField(
              controller: phoneController,
              keyboardType: TextInputType.phone,
              decoration: const InputDecoration(labelText: 'Phone (optional)'),
            ),
            const SizedBox(height: AppSpacing.md),
            TextField(
              controller: purposeController,
              decoration: const InputDecoration(
                labelText: 'Purpose (optional)',
              ),
            ),
            const SizedBox(height: AppSpacing.md),
            TextField(
              controller: whomController,
              decoration: const InputDecoration(
                labelText: 'Whom to meet (optional)',
              ),
            ),
            const SizedBox(height: AppSpacing.md),
            TextField(
              controller: idProofController,
              decoration: const InputDecoration(
                labelText: 'ID proof (optional)',
              ),
            ),
          ],
        ),
      ),
    );
    if (confirmed != true) return;

    final name = nameController.text.trim();
    if (name.isEmpty) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(const SnackBar(content: Text('Name is required')));
      }
      return;
    }

    setState(() => _busy = true);
    try {
      final api = ref.read(apiClientProvider);
      final result = await api.post<Map<String, dynamic>>(
        '/gate/visitors',
        data: {
          'name': name,
          if (phoneController.text.trim().isNotEmpty)
            'phone': phoneController.text.trim(),
          if (purposeController.text.trim().isNotEmpty)
            'purpose': purposeController.text.trim(),
          if (whomController.text.trim().isNotEmpty)
            'whomToMeet': whomController.text.trim(),
          if (idProofController.text.trim().isNotEmpty)
            'idProof': idProofController.text.trim(),
        },
      );
      ref.invalidate(_gateVisitorsProvider);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Pass ${result['passNo']} issued')),
        );
      }
    } on ApiException catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(e.message)));
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _issueGatePass() async {
    final studentIdController = TextEditingController();
    final reasonController = TextEditingController();
    final releasedToController = TextEditingController();
    final relationController = TextEditingController();

    final confirmed = await showAppFormSheet<bool>(
      context,
      builder: (context) => AppFormSheet(
        title: 'Issue gate pass',
        subtitle: 'Release a student during school hours',
        actions: [
          OutlinedButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Cancel'),
          ),
          AppSubmitButton(
            label: 'Issue',
            onPressed: () => Navigator.pop(context, true),
          ),
        ],
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          mainAxisSize: MainAxisSize.min,
          children: [
            TextField(
              controller: studentIdController,
              decoration: const InputDecoration(
                labelText: 'Student ID',
                helperText: 'No student picker yet',
              ),
              autofocus: true,
            ),
            const SizedBox(height: AppSpacing.md),
            TextField(
              controller: reasonController,
              decoration: const InputDecoration(labelText: 'Reason'),
            ),
            const SizedBox(height: AppSpacing.md),
            TextField(
              controller: releasedToController,
              decoration: const InputDecoration(labelText: 'Released to'),
            ),
            const SizedBox(height: AppSpacing.md),
            TextField(
              controller: relationController,
              decoration: const InputDecoration(
                labelText: 'Relation (optional)',
              ),
            ),
          ],
        ),
      ),
    );
    if (confirmed != true) return;

    final studentId = studentIdController.text.trim();
    final reason = reasonController.text.trim();
    final releasedTo = releasedToController.text.trim();
    if (studentId.isEmpty || reason.isEmpty || releasedTo.isEmpty) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Student ID, reason and released-to are required'),
          ),
        );
      }
      return;
    }

    setState(() => _busy = true);
    try {
      final api = ref.read(apiClientProvider);
      final result = await api.post<Map<String, dynamic>>(
        '/gate/passes',
        data: {
          'studentId': studentId,
          'reason': reason,
          'releasedTo': releasedTo,
          if (relationController.text.trim().isNotEmpty)
            'relation': relationController.text.trim(),
        },
      );
      ref.invalidate(_gatePassesProvider);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Gate pass ${result['passNo']} issued')),
        );
      }
    } on ApiException catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(e.message)));
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final visitors = ref.watch(_gateVisitorsProvider);
    final passes = ref.watch(_gatePassesProvider);

    return Scaffold(
      appBar: AppTopBar(
        title: 'Gate',
        actions: [
          AppIconButton(
            icon: Icons.confirmation_number_outlined,
            tooltip: 'Issue gate pass',
            onPressed: _busy ? null : _issueGatePass,
          ),
        ],
      ),
      floatingActionButton: AppFab(
        onPressed: _busy ? () {} : _logVisitor,
        icon: Icons.person_add_alt_1_outlined,
        label: 'Log visitor',
      ),
      body: RefreshIndicator(
        onRefresh: () async {
          ref.invalidate(_gateVisitorsProvider);
          ref.invalidate(_gatePassesProvider);
        },
        child: visitors.when(
          loading: () => const AppListSkeleton(),
          error: (err, _) => ErrorView(
            error: err,
            onRetry: () => ref.invalidate(_gateVisitorsProvider),
          ),
          data: (data) {
            final allRows = (data['visitors'] as List)
                .cast<Map<String, dynamic>>();
            final insideCount = data['insideCount'] as int? ?? 0;
            final q = _query.trim().toLowerCase();
            final rows = allRows.where((v) {
              if (_insideOnly && v['outAt'] != null) return false;
              if (q.isEmpty) return true;
              final haystack =
                  '${v['name']} ${v['purpose'] ?? ''} ${v['whomToMeet'] ?? ''}'
                      .toLowerCase();
              return haystack.contains(q);
            }).toList();

            return ListView(
              padding: const EdgeInsets.only(top: 8, bottom: 96),
              children: [
                Padding(
                  padding: const EdgeInsets.fromLTRB(
                    AppSpacing.page,
                    8,
                    AppSpacing.page,
                    8,
                  ),
                  child: AppSurface(
                    color: AppColors.brandLight,
                    child: Padding(
                      padding: const EdgeInsets.all(AppSpacing.ml),
                      child: Row(
                        children: [
                          const Icon(
                            Icons.groups_outlined,
                            color: AppColors.brandInk,
                            size: 28,
                          ),
                          const SizedBox(width: 12),
                          Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              const Eyebrow(
                                'Inside now',
                                color: AppColors.brandInk,
                              ),
                              Text(
                                '$insideCount',
                                style: const TextStyle(
                                  fontWeight: FontWeight.w700,
                                  fontSize: 24,
                                  color: AppColors.brandInk,
                                ),
                              ),
                            ],
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
                const Padding(
                  padding: EdgeInsets.fromLTRB(20, 8, 20, 4),
                  child: Eyebrow("Today's visitor log"),
                ),
                Padding(
                  padding: const EdgeInsets.fromLTRB(
                    AppSpacing.page,
                    0,
                    AppSpacing.page,
                    AppSpacing.sm,
                  ),
                  child: AppSearchField(
                    controller: _searchController,
                    hintText: 'Name, purpose or whom to meet',
                    onChanged: (value) => setState(() => _query = value),
                    textInputAction: TextInputAction.search,
                  ),
                ),
                Padding(
                  padding: const EdgeInsets.only(bottom: AppSpacing.sm),
                  child: AppFilterBar(
                    labels: const ['All', 'Inside'],
                    selectedIndex: _insideOnly ? 1 : 0,
                    onSelected: (index) =>
                        setState(() => _insideOnly = index == 1),
                  ),
                ),
                if (rows.isEmpty)
                  EmptyState(
                    icon: Icons.how_to_reg_outlined,
                    title: allRows.isEmpty ? 'No visitors' : 'No matches',
                    message: allRows.isEmpty
                        ? 'Anyone signed in at the gate today appears here.'
                        : 'Try a different search or filter.',
                  )
                else
                  ListView.separated(
                    shrinkWrap: true,
                    physics: const NeverScrollableScrollPhysics(),
                    itemCount: rows.length,
                    separatorBuilder: (_, _) => const Divider(
                      height: 1,
                      indent: AppSpacing.page,
                      endIndent: AppSpacing.page,
                    ),
                    itemBuilder: (context, index) {
                      final v = rows[index];
                      final outAt = v['outAt'] as String?;
                      final inside = outAt == null;
                      final subtitleParts = [
                        v['purpose'] as String?,
                        if (v['whomToMeet'] != null)
                          'to meet ${v['whomToMeet']}',
                        'in ${_clockOf(v['inAt'] as String)}',
                        if (outAt != null) 'out ${_clockOf(outAt)}',
                      ].whereType<String>().where((p) => p.isNotEmpty);

                      return AppListRow(
                        icon: Icons.person_outlined,
                        title: v['name'] as String,
                        subtitle: subtitleParts.join(' · '),
                        trailing: Column(
                          mainAxisAlignment: MainAxisAlignment.center,
                          crossAxisAlignment: CrossAxisAlignment.end,
                          mainAxisSize: MainAxisSize.min,
                          children: inside
                              ? [
                                  const ToneBadge('Inside', tone: Tone.warn),
                                  const SizedBox(height: 4),
                                  TextButton(
                                    onPressed: _busy
                                        ? null
                                        : () => _signOut(v['id'] as String),
                                    child: const Text('Sign out'),
                                  ),
                                ]
                              : [
                                  const ToneBadge(
                                    'Signed out',
                                    tone: Tone.neutral,
                                  ),
                                ],
                        ),
                      );
                    },
                  ),
                const Divider(height: 32, indent: 16, endIndent: 16),
                Padding(
                  padding: const EdgeInsets.fromLTRB(20, 0, 20, 4),
                  child: Row(
                    children: [
                      const Icon(
                        Icons.logout_outlined,
                        size: 16,
                        color: AppColors.info,
                      ),
                      const SizedBox(width: 6),
                      const Eyebrow(
                        'Gate passes today · early pickups',
                        color: AppColors.info,
                      ),
                    ],
                  ),
                ),
                passes.when(
                  loading: () => const AppInlineLoader(),
                  error: (err, _) => ErrorView(
                    error: err,
                    onRetry: () => ref.invalidate(_gatePassesProvider),
                  ),
                  data: (data) {
                    final passRows = (data['passes'] as List)
                        .cast<Map<String, dynamic>>();
                    if (passRows.isEmpty) {
                      return const EmptyState(
                        icon: Icons.no_accounts_outlined,
                        title: 'No early pickups',
                        message: 'Early pickup requests will appear here.',
                      );
                    }
                    return ListView.separated(
                      shrinkWrap: true,
                      physics: const NeverScrollableScrollPhysics(),
                      itemCount: passRows.length,
                      separatorBuilder: (_, _) => const Divider(
                        height: 1,
                        indent: AppSpacing.page,
                        endIndent: AppSpacing.page,
                      ),
                      itemBuilder: (context, index) {
                        final p = passRows[index];
                        final studentName = p['studentName'] as String?;
                        final className = p['className'] as String?;
                        final sectionName = p['sectionName'] as String?;
                        return AppListRow(
                          icon: Icons.directions_walk_outlined,
                          tone: Tone.info,
                          title: studentName ?? 'Student',
                          subtitle: [
                            if (className != null)
                              '$className${sectionName != null ? ' $sectionName' : ''}',
                            'released to ${p['releasedTo']}${p['relation'] != null ? ' (${p['relation']})' : ''}',
                            p['reason'] as String? ?? '',
                          ].where((s) => s.isNotEmpty).join(' · '),
                          trailing: Column(
                            mainAxisAlignment: MainAxisAlignment.center,
                            crossAxisAlignment: CrossAxisAlignment.end,
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Text(
                                p['passNo'] as String? ?? '',
                                style: const TextStyle(
                                  color: AppColors.ink3,
                                  fontSize: 11.5,
                                  fontFamily: 'monospace',
                                ),
                              ),
                              const SizedBox(height: 4),
                              Text(
                                _clockOf(p['issuedAt'] as String),
                                style: const TextStyle(
                                  color: AppColors.ink3,
                                  fontSize: 11.5,
                                ),
                              ),
                            ],
                          ),
                        );
                      },
                    );
                  },
                ),
              ],
            );
          },
        ),
      ),
    );
  }
}
