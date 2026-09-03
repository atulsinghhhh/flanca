import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/auth/auth_state.dart';
import '../../core/format.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/app_widgets.dart';
import '../calendar/calendar_screen.dart' show toneForEventKind, kindLabel;

final _yearOverviewProvider = FutureProvider.autoDispose.family<Map<String, dynamic>, String>(
  (ref, yearId) async {
    final api = ref.watch(apiClientProvider);
    return api.get<Map<String, dynamic>>('/settings/years/$yearId/overview');
  },
);

/// The whole session at a glance, from Settings → Years → tap a year: exam
/// terms, PTM days and calendar entries (holidays/events/activities) for that
/// one academic year, folded into a single timeline by getAcademicYearOverview
/// (src/lib/queries/year-overview.ts). Nothing here is created or edited —
/// exam terms come from the Exams module, PTM from opening slots there, and
/// calendar entries from the Calendar tab; this screen only reads them back
/// as "what does this session look like end to end", which today means
/// visiting three separate places to find out.
class AcademicYearOverviewScreen extends ConsumerWidget {
  const AcademicYearOverviewScreen({super.key, required this.yearId, required this.yearName});

  final String yearId;
  final String yearName;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final result = ref.watch(_yearOverviewProvider(yearId));

    return Scaffold(
      appBar: AppTopBar(title: yearName),
      body: RefreshIndicator(
        onRefresh: () async => ref.invalidate(_yearOverviewProvider(yearId)),
        color: AppColors.brand,
        backgroundColor: AppColors.card,
        child: result.when(
          loading: () => const AppListSkeleton(),
          error: (err, _) => ErrorView(error: err, onRetry: () => ref.invalidate(_yearOverviewProvider(yearId))),
          data: (data) {
            final year = data['year'] as Map<String, dynamic>;
            final items = (data['items'] as List).cast<Map<String, dynamic>>();

            if (items.isEmpty) {
              return EmptyState(
                icon: Icons.event_note_outlined,
                title: 'Nothing planned yet',
                message:
                    '${year['startDate']} → ${year['endDate']}. Exam terms, PTM days and calendar entries for this session will show up here once they exist.',
              );
            }

            return ListView.separated(
              padding: const EdgeInsets.fromLTRB(
                AppSpacing.page,
                AppSpacing.sm,
                AppSpacing.page,
                AppSpacing.xxl,
              ),
              itemCount: items.length,
              separatorBuilder: (_, _) => const SizedBox(height: AppSpacing.md),
              itemBuilder: (context, index) {
                final item = items[index];
                final kind = item['kind'] as String? ?? '';
                final tone = toneForEventKind(kind);
                final detail = item['detail'] as String?;
                final endDate = item['endDate'] as String?;
                final dateLabel = endDate == null
                    ? formatDay(item['date'] as String)
                    : '${formatDay(item['date'] as String)} → ${formatDay(endDate)}';

                return AppFadeIn(
                  delay: AppFadeIn.stagger(index),
                  child: AppSurface(
                    child: AppListRow(
                      leading: Container(
                        width: 40,
                        height: 40,
                        alignment: Alignment.center,
                        decoration: BoxDecoration(
                          color: toneBackground(tone),
                          borderRadius: BorderRadius.circular(AppRadius.sm),
                        ),
                        child: Icon(_iconForKind(kind), size: 19, color: toneColor(tone)),
                      ),
                      title: item['title'] as String? ?? '',
                      subtitle: detail == null ? dateLabel : '$dateLabel · $detail',
                      trailing: ToneBadge(kindLabel(kind), tone: tone),
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

IconData _iconForKind(String kind) => switch (kind.toUpperCase()) {
  'EXAM_TERM' || 'EXAM' => Icons.edit_document,
  'PTM' || 'MEETING' => Icons.groups_outlined,
  'HOLIDAY' => Icons.beach_access_outlined,
  'ACTIVITY' => Icons.sports_soccer_outlined,
  _ => Icons.event_note_outlined,
};
