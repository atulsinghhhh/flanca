import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/auth/auth_state.dart';
import '../../core/format.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/app_widgets.dart';

final calendarProvider = FutureProvider.autoDispose((ref) async {
  final api = ref.watch(apiClientProvider);
  return api.get<Map<String, dynamic>>('/calendar');
});

const _monthAbbr = [
  'JAN',
  'FEB',
  'MAR',
  'APR',
  'MAY',
  'JUN',
  'JUL',
  'AUG',
  'SEP',
  'OCT',
  'NOV',
  'DEC',
];

/// Holidays, exams and everything else read very differently in a list of
/// upcoming days, so each kind gets its own tone rather than one grey block.
Tone _toneForEventKind(String kind) => switch (kind.toUpperCase()) {
  'HOLIDAY' => Tone.good,
  'EXAM' => Tone.bad,
  'EVENT' => Tone.brand,
  'ACTIVITY' => Tone.info,
  'MEETING' => Tone.warn,
  _ => Tone.neutral,
};

/// "PARENT_TEACHER_MEETING" → "Parent teacher meeting".
String _kindLabel(String kind) {
  final words = kind.toLowerCase().replaceAll('_', ' ');
  return words.isEmpty ? words : words[0].toUpperCase() + words.substring(1);
}

/// Mirrors src/app/app/calendar/page.tsx's read side — upcoming school events.
/// Filterable by kind — the whole feed is fetched in one call, so the filter
/// runs client-side over it, with tabs built from whatever kinds are
/// actually present rather than a fixed guessed set.
class CalendarScreen extends ConsumerStatefulWidget {
  const CalendarScreen({super.key});

  @override
  ConsumerState<CalendarScreen> createState() => _CalendarScreenState();
}

class _CalendarScreenState extends ConsumerState<CalendarScreen> {
  String _kindFilter = '_ALL';

  @override
  Widget build(BuildContext context) {
    final calendar = ref.watch(calendarProvider);

    return Scaffold(
      appBar: AppTopBar(title: 'Calendar'),
      body: RefreshIndicator(
        onRefresh: () async => ref.invalidate(calendarProvider),
        child: calendar.when(
          loading: () => const AppListSkeleton(),
          error: (err, _) => ErrorView(
            error: err,
            onRetry: () => ref.invalidate(calendarProvider),
          ),
          data: (data) {
            final all = (data['events'] as List).cast<Map<String, dynamic>>();
            if (all.isEmpty) {
              return const EmptyState(
                icon: Icons.event_note_outlined,
                title: 'Nothing scheduled',
                message: 'School events and holidays will show up here.',
              );
            }

            final kinds = {
              for (final e in all) (e['kind'] as String? ?? ''),
            }.where((k) => k.isNotEmpty).toList()..sort();
            final tabValues = ['_ALL', ...kinds];
            if (!tabValues.contains(_kindFilter)) _kindFilter = '_ALL';
            final events = _kindFilter == '_ALL'
                ? all
                : all.where((e) => e['kind'] == _kindFilter).toList();

            return Column(
              children: [
                if (kinds.length > 1)
                  Padding(
                    padding: const EdgeInsets.fromLTRB(
                      AppSpacing.page,
                      AppSpacing.xs,
                      AppSpacing.page,
                      AppSpacing.sm,
                    ),
                    child: AppFilterBar(
                      labels: [
                        for (final v in tabValues)
                          v == '_ALL' ? 'All' : _kindLabel(v),
                      ],
                      selectedIndex: tabValues.indexOf(_kindFilter),
                      onSelected: (index) =>
                          setState(() => _kindFilter = tabValues[index]),
                    ),
                  ),
                Expanded(
                  child: events.isEmpty
                      ? const EmptyState(
                          icon: Icons.event_note_outlined,
                          title: 'No matches',
                          message: 'Try a different filter.',
                        )
                      : ListView.separated(
                          padding: const EdgeInsets.fromLTRB(
                            AppSpacing.page,
                            AppSpacing.md,
                            AppSpacing.page,
                            AppSpacing.xxl,
                          ),
                          itemCount: events.length,
                          separatorBuilder: (_, _) =>
                              const SizedBox(height: AppSpacing.md),
                          itemBuilder: (context, index) {
                            final e = events[index];
                            final start = e['startDate'] as String;
                            final end = e['endDate'] as String?;
                            final parsed = DateTime.parse(start);
                            final kind = e['kind'] as String? ?? '';
                            final tone = _toneForEventKind(kind);

                            return AppFadeIn(
                              delay: AppFadeIn.stagger(index),
                              child: AppSurface(
                                child: AppListRow(
                                  // A tear-off calendar block, tinted to the kind of day
                                  // it is — a holiday and an exam should not look alike
                                  // in a list you scan for "what's coming".
                                  leading: Container(
                                    width: 48,
                                    height: 52,
                                    decoration: BoxDecoration(
                                      color: toneBackground(tone),
                                      borderRadius: BorderRadius.circular(
                                        AppRadius.sm,
                                      ),
                                    ),
                                    child: Column(
                                      mainAxisAlignment:
                                          MainAxisAlignment.center,
                                      children: [
                                        Text(
                                          _monthAbbr[parsed.month - 1],
                                          style: TextStyle(
                                            color: toneColor(tone),
                                            fontSize: 9.5,
                                            fontWeight: FontWeight.w800,
                                            letterSpacing: 0.6,
                                            height: 1.1,
                                          ),
                                        ),
                                        Text(
                                          '${parsed.day}',
                                          style: TextStyle(
                                            color: toneInk(tone),
                                            fontSize: 20,
                                            fontWeight: FontWeight.w800,
                                            height: 1.2,
                                            letterSpacing: -0.5,
                                          ),
                                        ),
                                      ],
                                    ),
                                  ),
                                  title: e['title'] as String? ?? '',
                                  subtitle: end != null ? 'Until ${formatDay(end)}' : null,
                                  trailing: kind.isNotEmpty
                                      ? ToneBadge(
                                          _kindLabel(kind),
                                          tone: tone,
                                          dot: false,
                                        )
                                      : null,
                                ),
                              ),
                            );
                          },
                        ),
                ),
              ],
            );
          },
        ),
      ),
    );
  }
}
