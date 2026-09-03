import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/auth/auth_state.dart';
import '../../core/format.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/app_widgets.dart';
import 'payroll_screen.dart';
import 'staff_detail_screen.dart';

/// The department list is fetched unfiltered so the filter pills stay stable
/// as the visible directory narrows — deriving them from the filtered
/// response would make the pills you didn't pick disappear.
final _staffDepartmentsProvider = FutureProvider<List<String>>((ref) async {
  final api = ref.watch(apiClientProvider);
  final data = await api.get<Map<String, dynamic>>('/staff');
  final summary = data['summary'] as Map<String, dynamic>?;
  return (summary?['departments'] as List?)?.cast<String>() ?? const [];
});

class StaffQuery {
  const StaffQuery({this.q = '', this.dept});

  final String q;
  final String? dept;

  StaffQuery copyWith({String? q, String? dept, bool clearDept = false}) => StaffQuery(
        q: q ?? this.q,
        dept: clearDept ? null : (dept ?? this.dept),
      );

  Map<String, dynamic> toQuery() => {if (q.isNotEmpty) 'q': q, if (dept != null) 'dept': dept};

  @override
  bool operator ==(Object other) => other is StaffQuery && other.q == q && other.dept == dept;

  @override
  int get hashCode => Object.hash(q, dept);
}

final staffListProvider = FutureProvider.family<Map<String, dynamic>, StaffQuery>((ref, query) async {
  final api = ref.watch(apiClientProvider);
  return api.get<Map<String, dynamic>>('/staff', query: query.toQuery());
});

Tone _toneForAttendance(int? percentBp) {
  if (percentBp == null) return Tone.neutral;
  if (percentBp >= 9000) return Tone.good;
  if (percentBp >= 7500) return Tone.warn;
  return Tone.bad;
}

/// Mirrors src/app/app/staff's directory: on-strength headcount, per-staff
/// designation/department, and a way into payroll for the whole school.
/// Searchable by name/employee id/designation and filterable by department —
/// both already supported server-side (GET /staff?q=&dept=), just unused
/// until now.
class StaffListScreen extends ConsumerStatefulWidget {
  const StaffListScreen({super.key});

  @override
  ConsumerState<StaffListScreen> createState() => _StaffListScreenState();
}

class _StaffListScreenState extends ConsumerState<StaffListScreen> {
  StaffQuery _query = const StaffQuery();
  final _searchController = TextEditingController();
  Timer? _debounce;

  @override
  void dispose() {
    _debounce?.cancel();
    _searchController.dispose();
    super.dispose();
  }

  void _onSearchChanged(String value) {
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 350), () {
      setState(() => _query = _query.copyWith(q: value));
    });
  }

  @override
  Widget build(BuildContext context) {
    final staff = ref.watch(staffListProvider(_query));
    final departments = ref.watch(_staffDepartmentsProvider);

    return Scaffold(
      appBar: AppTopBar(
        title: 'Staff',
        actions: [
          AppIconButton(
            icon: Icons.account_balance_wallet_outlined,
            tooltip: 'Payroll',
            onPressed: () => Navigator.of(context).push(
              MaterialPageRoute(builder: (_) => const PayrollScreen()),
            ),
          ),
        ],
      ),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(AppSpacing.page, AppSpacing.xs, AppSpacing.page, AppSpacing.sm),
            child: AppSearchField(
              controller: _searchController,
              hintText: 'Name, employee id, designation',
              onChanged: _onSearchChanged,
              textInputAction: TextInputAction.search,
            ),
          ),
          departments.when(
            loading: () => const SizedBox.shrink(),
            error: (_, _) => const SizedBox.shrink(),
            data: (options) {
              if (options.isEmpty) return const SizedBox.shrink();
              final labels = ['All departments', ...options];
              final selectedIndex = _query.dept == null ? 0 : labels.indexOf(_query.dept!);
              return Padding(
                padding: const EdgeInsets.only(bottom: AppSpacing.sm),
                child: AppFilterBar(
                  labels: labels,
                  selectedIndex: selectedIndex < 0 ? 0 : selectedIndex,
                  onSelected: (index) => setState(
                    () => _query = index == 0 ? _query.copyWith(clearDept: true) : _query.copyWith(dept: labels[index]),
                  ),
                ),
              );
            },
          ),
          Expanded(
            child: RefreshIndicator(
              onRefresh: () async => ref.invalidate(staffListProvider(_query)),
              color: AppColors.brand,
              backgroundColor: AppColors.card,
              child: staff.when(
                loading: () => const AppListSkeleton(rows: 8, hasLeading: true),
                error: (err, _) => ErrorView(error: err, onRetry: () => ref.invalidate(staffListProvider(_query))),
                data: (data) {
                  final rows = (data['staff'] as List).cast<Map<String, dynamic>>();
                  final summary = data['summary'] as Map<String, dynamic>?;

                  if (rows.isEmpty) {
                    return const EmptyState(
                      icon: Icons.person_search_outlined,
                      title: 'No matches',
                      message: 'Try a different search or filter.',
                    );
                  }

                  return ListView(
                    padding: const EdgeInsets.fromLTRB(
                      AppSpacing.page,
                      AppSpacing.md,
                      AppSpacing.page,
                      AppSpacing.xxl,
                    ),
                    children: [
                      if (summary != null && _query.q.isEmpty && _query.dept == null) ...[
                        AppSummaryCard(
                          margin: EdgeInsets.zero,
                          stats: [
                            AppStat(label: 'On strength', value: '${summary['onStrength']}'),
                            AppStat(
                              label: 'Departments',
                              value: '${(summary['departments'] as List?)?.length ?? 0}',
                            ),
                            AppStat(
                              label: 'Wage bill',
                              value: formatMoney(summary['monthlyBasicWageBill'] as int? ?? 0),
                            ),
                          ],
                        ),
                        const SizedBox(height: AppSpacing.xl),
                      ],
                      SectionHeader('Directory', count: rows.length),
                      const SizedBox(height: AppSpacing.md),
                      for (var index = 0; index < rows.length; index++)
                        Padding(
                          padding: const EdgeInsets.only(bottom: AppSpacing.sm + 2),
                          child: AppFadeIn(
                            delay: AppFadeIn.stagger(index),
                            child: _StaffRow(staff: rows[index]),
                          ),
                        ),
                    ],
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

/// One staff member. The attendance percentage is the trailing badge, and any
/// pending leave request shows as a warn chip rather than a line of 11px grey
/// text that nobody read.
class _StaffRow extends StatelessWidget {
  const _StaffRow({required this.staff});

  final Map<String, dynamic> staff;

  @override
  Widget build(BuildContext context) {
    final attendance = staff['attendance'] as Map<String, dynamic>?;
    final percentBp = attendance?['percentBp'] as int?;
    final subjects = (staff['subjects'] as List?)?.cast<String>() ?? const [];
    final pendingLeave = staff['pendingLeaveRequests'] as int? ?? 0;
    final name = staff['name'] as String;
    final subtitle = [
      staff['designation'] as String?,
      staff['department'] as String?,
      if (subjects.isNotEmpty) subjects.join(', '),
    ].whereType<String>().where((p) => p.isNotEmpty).join(' · ');

    return AppSurface(
      onTap: () => Navigator.of(context).push(
        MaterialPageRoute(builder: (_) => StaffDetailScreen(staffId: staff['staffId'] as String)),
      ),
      padding: const EdgeInsets.all(AppSpacing.lg),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              AppAvatar(name: name, size: 42, tone: Tone.info),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(
                      name,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15, letterSpacing: -0.25),
                    ),
                    if (subtitle.isNotEmpty)
                      Padding(
                        padding: const EdgeInsets.only(top: 2),
                        child: Text(
                          subtitle,
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(color: AppColors.ink3, fontSize: 12.5, height: 1.35),
                        ),
                      ),
                  ],
                ),
              ),
              if (percentBp != null) ...[
                const SizedBox(width: AppSpacing.sm),
                ToneBadge(
                  '${(percentBp / 100).toStringAsFixed(0)}%',
                  tone: _toneForAttendance(percentBp),
                  dot: false,
                ),
              ],
            ],
          ),
          if (pendingLeave > 0) ...[
            const SizedBox(height: AppSpacing.md),
            AppStatChip(
              label: '$pendingLeave leave request${pendingLeave == 1 ? '' : 's'} pending',
              icon: Icons.pending_actions_outlined,
              tone: Tone.warn,
            ),
          ],
        ],
      ),
    );
  }
}
