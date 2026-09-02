import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/auth/auth_state.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/app_widgets.dart';

final _schoolTimetableProvider = FutureProvider.autoDispose.family<Map<String, dynamic>, int>(
  (ref, dayOfWeek) async {
    final api = ref.watch(apiClientProvider);
    return api.get<Map<String, dynamic>>('/timetable/school', query: {'dayOfWeek': '$dayOfWeek'});
  },
);

const _dayTabs = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/// The office's wall-chart: every section in the school, side by side, for
/// one day — src/lib/queries/timetable.ts::getSchoolTimetableForDay. Where
/// ClassTimetableScreen is one section's whole week, this is the whole
/// school's one day, which is the shape a real timetable chart on an office
/// wall actually takes.
class MasterTimetableScreen extends StatelessWidget {
  const MasterTimetableScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return DefaultTabController(
      length: _dayTabs.length,
      child: Scaffold(
        appBar: const AppTopBar(
          title: 'Master timetable',
          subtitle: 'Every section, one day at a time',
          bottom: AppTabBar(tabs: _dayTabs),
        ),
        // Swiping is off: the day pager and the grid's own horizontal scroll
        // both want the same drag gesture, and letting the pager win means a
        // finger meant to scroll past column three quietly changes the day
        // instead. Day switching stays tap-only on the tabs above.
        body: TabBarView(
          physics: const NeverScrollableScrollPhysics(),
          children: [for (var day = 1; day <= _dayTabs.length; day++) _MasterDayGrid(dayOfWeek: day)],
        ),
      ),
    );
  }
}

class _MasterDayGrid extends ConsumerWidget {
  const _MasterDayGrid({required this.dayOfWeek});

  final int dayOfWeek;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final result = ref.watch(_schoolTimetableProvider(dayOfWeek));

    return RefreshIndicator(
      onRefresh: () async => ref.invalidate(_schoolTimetableProvider(dayOfWeek)),
      child: result.when(
        loading: () => const AppCardsSkeleton(),
        error: (err, _) => ErrorView(error: err, onRetry: () => ref.invalidate(_schoolTimetableProvider(dayOfWeek))),
        data: (data) {
          final sections = (data['sections'] as List? ?? []).cast<Map<String, dynamic>>();
          if (sections.isEmpty) {
            return const EmptyState(icon: Icons.calendar_view_week_rounded, title: 'No classes yet', message: 'Set up classes and sections first.');
          }

          final longestDay = sections
              .expand((s) => (s['periods'] as List? ?? []).cast<Map<String, dynamic>>())
              .fold<int>(0, (max, p) => (p['period'] as int) > max ? p['period'] as int : max);
          final periods = List.generate(longestDay < 8 ? 8 : longestDay, (i) => i + 1);

          return SingleChildScrollView(
            physics: const AlwaysScrollableScrollPhysics(),
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                _MasterGrid(sections: sections, periods: periods),
                if (sections.length > 3)
                  Padding(
                    padding: const EdgeInsets.only(top: 10),
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        const Icon(Icons.swipe_outlined, size: 14, color: AppColors.ink3),
                        const SizedBox(width: 6),
                        Text(
                          'Swipe sideways for the rest of the sections',
                          style: const TextStyle(color: AppColors.ink3, fontSize: 11.5, fontWeight: FontWeight.w600),
                        ),
                      ],
                    ),
                  ),
              ],
            ),
          );
        },
      ),
    );
  }
}

/// Periods frozen down the left, one column per section scrolling
/// horizontally — the transpose of ClassTimetableScreen's grid, same
/// LayoutBuilder-measured-width trick so the scroll region is never
/// accidentally sized to its own content (the bug that made the per-section
/// grid stop at three columns instead of scrolling).
class _MasterGrid extends StatelessWidget {
  const _MasterGrid({required this.sections, required this.periods});

  final List<Map<String, dynamic>> sections;
  final List<int> periods;

  static const _periodColWidth = 64.0;
  static const _sectionColWidth = 128.0;
  static const _rowHeight = 56.0;
  static const _headerHeight = 44.0;

  static const _gridBorder = Border(
    right: BorderSide(color: AppColors.line),
    bottom: BorderSide(color: AppColors.line),
  );

  static const _headerDecoration = BoxDecoration(color: AppColors.paper2, border: _gridBorder);

  @override
  Widget build(BuildContext context) {
    // Every section's periods, keyed for O(1) lookup while building cells —
    // computed once per build rather than re-scanning each section's list
    // inside the row loop below.
    final bySection = <String, Map<int, Map<String, dynamic>>>{};
    for (final s in sections) {
      final byPeriod = <int, Map<String, dynamic>>{};
      for (final p in (s['periods'] as List? ?? []).cast<Map<String, dynamic>>()) {
        byPeriod[p['period'] as int] = p;
      }
      bySection[s['id'] as String] = byPeriod;
    }

    return LayoutBuilder(
      builder: (context, constraints) {
        final sectionsWidth = sections.length * _sectionColWidth;
        final availableWidth = (constraints.maxWidth - _periodColWidth).clamp(0.0, double.infinity);
        final viewportWidth = sectionsWidth < availableWidth ? sectionsWidth : availableWidth;

        return AppSurface(
          clip: true,
          padding: EdgeInsets.zero,
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // The frozen "Period" column.
              Column(
                children: [
                  Container(
                    width: _periodColWidth,
                    height: _headerHeight,
                    alignment: Alignment.center,
                    decoration: _headerDecoration,
                    child: const Text('Period', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 11, color: AppColors.ink2)),
                  ),
                  for (final p in periods)
                    Container(
                      width: _periodColWidth,
                      height: _rowHeight,
                      alignment: Alignment.center,
                      decoration: const BoxDecoration(color: AppColors.paper2, border: _gridBorder),
                      child: Text('$p', style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13, color: AppColors.ink2)),
                    ),
                ],
              ),
              SizedBox(
                width: viewportWidth,
                child: SingleChildScrollView(
                  scrollDirection: Axis.horizontal,
                  child: Column(
                    children: [
                      Row(
                        children: [
                          for (final s in sections)
                            Container(
                              width: _sectionColWidth,
                              height: _headerHeight,
                              alignment: Alignment.center,
                              padding: const EdgeInsets.symmetric(horizontal: 4),
                              decoration: _headerDecoration,
                              child: Text(
                                s['label'] as String? ?? '',
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 12.5, color: AppColors.ink),
                              ),
                            ),
                        ],
                      ),
                      for (final p in periods)
                        Row(
                          children: [
                            for (final s in sections)
                              _MasterCell(
                                width: _sectionColWidth,
                                height: _rowHeight,
                                entry: bySection[s['id'] as String]?[p],
                              ),
                          ],
                        ),
                    ],
                  ),
                ),
              ),
            ],
          ),
        );
      },
    );
  }
}

class _MasterCell extends StatelessWidget {
  const _MasterCell({required this.width, required this.height, required this.entry});

  final double width;
  final double height;
  final Map<String, dynamic>? entry;

  static const _gridBorder = Border(
    right: BorderSide(color: AppColors.line),
    bottom: BorderSide(color: AppColors.line),
  );

  @override
  Widget build(BuildContext context) {
    final subjectName = entry?['subjectName'] as String?;
    final staffName = entry?['staffName'] as String?;

    return Container(
      width: width,
      height: height,
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 4),
      decoration: const BoxDecoration(color: AppColors.card, border: _gridBorder),
      alignment: subjectName == null ? Alignment.center : Alignment.centerLeft,
      child: subjectName != null
          ? Column(
              mainAxisAlignment: MainAxisAlignment.center,
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(subjectName, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 12, color: AppColors.ink)),
                if (staffName != null) ...[
                  const SizedBox(height: 2),
                  Text(staffName, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 10.5, color: AppColors.ink3)),
                ],
              ],
            )
          : const Icon(Icons.remove_rounded, size: 14, color: AppColors.ink3),
    );
  }
}
