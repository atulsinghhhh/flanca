import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/auth/auth_state.dart';
import '../../core/network/api_exception.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/app_widgets.dart';

final myTimetableProvider = FutureProvider.autoDispose((ref) async {
  final api = ref.watch(apiClientProvider);
  return api.get<Map<String, dynamic>>('/timetable/me');
});

/// A teacher's own periods for the day — src/lib/queries/timetable.ts::getMyTimetableForDay.
/// (Viewing a whole section's grid, and office editing, come in a later pass —
/// this is the daily "what do I teach today" view a teacher actually opens.)
class TimetableScreen extends ConsumerWidget {
  const TimetableScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final timetable = ref.watch(myTimetableProvider);

    return Scaffold(
      appBar: AppTopBar(title: 'Timetable'),
      body: RefreshIndicator(
        onRefresh: () async => ref.invalidate(myTimetableProvider),
        child: timetable.when(
          loading: () => const AppCardsSkeleton(),
          error: (err, _) {
            if (err is ApiException && err.status == 404) {
              return const EmptyState(
                icon: Icons.calendar_view_week_outlined,
                title: 'No timetable', message: 'There is no timetable linked to your account yet.',
              );
            }
            return ErrorView(error: err, onRetry: () => ref.invalidate(myTimetableProvider));
          },
          data: (data) {
            final entries = (data['entries'] as List).cast<Map<String, dynamic>>();
            if (entries.isEmpty) {
              return const EmptyState(icon: Icons.free_breakfast_outlined, title: 'Nothing today', message: 'You have no periods scheduled for today.');
            }
            // A vertical run of period cards rather than a divided list: the
            // day reads as a sequence, and the period number gets the strong
            // left-edge position instead of a circle that said nothing.
            return ListView.separated(
              padding: const EdgeInsets.fromLTRB(
                AppSpacing.page,
                AppSpacing.md,
                AppSpacing.page,
                AppSpacing.xxl,
              ),
              itemCount: entries.length,
              separatorBuilder: (_, _) => const SizedBox(height: AppSpacing.md),
              itemBuilder: (context, index) {
                final e = entries[index];
                final where = '${e['className'] ?? ''} ${e['sectionName'] ?? ''}'.trim();
                final startTime = e['startTime'] as String?;

                return AppFadeIn(
                  delay: AppFadeIn.stagger(index),
                  child: AppSurface(
                    clip: true,
                    child: IntrinsicHeight(
                      child: Row(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          Container(
                            width: 56,
                            color: AppColors.brandLight,
                            child: Column(
                              mainAxisAlignment: MainAxisAlignment.center,
                              children: [
                                const Text(
                                  'PERIOD',
                                  style: TextStyle(
                                    color: AppColors.brand,
                                    fontSize: 8,
                                    fontWeight: FontWeight.w800,
                                    letterSpacing: 0.6,
                                    height: 1.2,
                                  ),
                                ),
                                Text(
                                  '${e['period']}',
                                  style: const TextStyle(
                                    color: AppColors.brandInk,
                                    fontSize: 20,
                                    fontWeight: FontWeight.w800,
                                    height: 1.2,
                                    letterSpacing: -0.5,
                                  ),
                                ),
                              ],
                            ),
                          ),
                          Expanded(
                            child: Padding(
                              padding: const EdgeInsets.all(AppSpacing.lg),
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  Text(
                                    e['subjectName'] as String? ?? 'Free period',
                                    style: const TextStyle(
                                      fontWeight: FontWeight.w700,
                                      fontSize: 15.5,
                                      letterSpacing: -0.25,
                                    ),
                                  ),
                                  if (where.isNotEmpty)
                                    Padding(
                                      padding: const EdgeInsets.only(top: 3),
                                      child: Text(
                                        where,
                                        style: const TextStyle(color: AppColors.ink3, fontSize: 13),
                                      ),
                                    ),
                                  if (startTime != null)
                                    Padding(
                                      padding: const EdgeInsets.only(top: AppSpacing.sm),
                                      child: Row(
                                        children: [
                                          const Icon(Icons.schedule_outlined, size: 13, color: AppColors.ink3),
                                          const SizedBox(width: 5),
                                          Text(
                                            startTime,
                                            style: const TextStyle(
                                              color: AppColors.ink2,
                                              fontSize: 12.5,
                                              fontWeight: FontWeight.w600,
                                            ),
                                          ),
                                        ],
                                      ),
                                    ),
                                ],
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                );
              },
            );
          },
        ),
      ),
    );
  }
}
