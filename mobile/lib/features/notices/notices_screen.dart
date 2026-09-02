import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/auth/auth_state.dart';
import '../../core/format.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/app_widgets.dart';
import 'notice_compose_screen.dart';

final noticesProvider = FutureProvider.autoDispose((ref) async {
  final api = ref.watch(apiClientProvider);
  return api.get<Map<String, dynamic>>('/notices');
});

(IconData, Tone) _audienceStyle(String? audience) => switch (audience) {
      'TEACHERS' => (Icons.school_outlined, Tone.info),
      'STUDENTS' => (Icons.backpack_outlined, Tone.brand),
      'PARENTS' => (Icons.family_restroom_outlined, Tone.warn),
      'STAFF' => (Icons.badge_outlined, Tone.info),
      _ => (Icons.public_outlined, Tone.neutral),
    };

String _audienceLabel(String? audience) => switch (audience) {
      'TEACHERS' => 'Teachers',
      'STUDENTS' => 'Students',
      'PARENTS' => 'Parents',
      'STAFF' => 'All staff',
      _ => 'Everyone',
    };

const _audienceTabs = [
  (value: '_ALL', label: 'All'),
  (value: '_EVERYONE', label: 'Everyone'),
  (value: 'TEACHERS', label: 'Teachers'),
  (value: 'STUDENTS', label: 'Students'),
  (value: 'PARENTS', label: 'Parents'),
  (value: 'STAFF', label: 'Staff'),
];

/// Mirrors src/app/app/notices/page.tsx's read side — the circulars feed —
/// restyled as a notice board (accent strip + audience/date chips) instead of
/// a plain divided list, and adds the office-only compose flow
/// (src/app/app/notices/actions.ts::publishCircular's mobile twin). The whole
/// feed is fetched in one call, so search and the audience filter both run
/// client-side over it.
class NoticesScreen extends ConsumerStatefulWidget {
  const NoticesScreen({super.key});

  @override
  ConsumerState<NoticesScreen> createState() => _NoticesScreenState();
}

class _NoticesScreenState extends ConsumerState<NoticesScreen> {
  final _searchController = TextEditingController();
  String _query = '';
  String _audience = '_ALL';

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final notices = ref.watch(noticesProvider);
    final isOffice = ref.watch(authControllerProvider).actor?.isOffice ?? false;

    return Scaffold(
      appBar: const AppTopBar(title: 'Notices'),
      floatingActionButton: isOffice
          ? AppFab(
              onPressed: () => Navigator.of(context).push(
                MaterialPageRoute(builder: (_) => const NoticeComposeScreen()),
              ),
              icon: Icons.add_rounded,
              label: 'New notice',
            )
          : null,
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(AppSpacing.page, AppSpacing.xs, AppSpacing.page, AppSpacing.sm),
            child: AppSearchField(
              controller: _searchController,
              hintText: 'Search notices',
              onChanged: (value) => setState(() => _query = value),
              textInputAction: TextInputAction.search,
            ),
          ),
          Padding(
            padding: const EdgeInsets.only(bottom: AppSpacing.sm),
            child: AppFilterBar(
              labels: [for (final t in _audienceTabs) t.label],
              selectedIndex: _audienceTabs.indexWhere((t) => t.value == _audience),
              onSelected: (index) => setState(() => _audience = _audienceTabs[index].value),
            ),
          ),
          Expanded(
            child: RefreshIndicator(
              onRefresh: () async => ref.invalidate(noticesProvider),
              color: AppColors.brand,
              backgroundColor: AppColors.card,
              child: notices.when(
                loading: () => const AppCardsSkeleton(),
                error: (err, _) => ErrorView(error: err, onRetry: () => ref.invalidate(noticesProvider)),
                data: (data) {
                  final all = (data['circulars'] as List).cast<Map<String, dynamic>>();
                  final q = _query.trim().toLowerCase();
                  final circulars = all.where((c) {
                    final audience = c['audience'] as String?;
                    final matchesAudience = switch (_audience) {
                      '_ALL' => true,
                      '_EVERYONE' => audience == null,
                      _ => audience == _audience,
                    };
                    if (!matchesAudience) return false;
                    if (q.isEmpty) return true;
                    final title = (c['title'] as String? ?? '').toLowerCase();
                    final body = (c['body'] as String? ?? '').toLowerCase();
                    return title.contains(q) || body.contains(q);
                  }).toList();

                  if (circulars.isEmpty) {
                    return EmptyState(
                      icon: Icons.campaign_outlined,
                      title: all.isEmpty ? 'No notices' : 'No matches',
                      message: all.isEmpty
                          ? 'Circulars from the school will appear here.'
                          : 'Try a different search or filter.',
                    );
                  }
                  return ListView.separated(
                    padding: EdgeInsets.fromLTRB(
                      AppSpacing.page,
                      AppSpacing.md,
                      AppSpacing.page,
                      isOffice ? AppSpacing.bottomSafe : AppSpacing.xxl,
                    ),
                    itemCount: circulars.length,
                    separatorBuilder: (_, _) => const SizedBox(height: AppSpacing.md),
                    itemBuilder: (context, index) => AppFadeIn(
                      delay: AppFadeIn.stagger(index),
                      child: _NoticeCard(circular: circulars[index]),
                    ),
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

/// One circular, as a pinned board card: a tone rail keyed to the audience
/// down the left, the audience itself as a badge, the date as quiet metadata,
/// and the body given room to be read rather than squeezed under a header.
class _NoticeCard extends StatelessWidget {
  const _NoticeCard({required this.circular});

  final Map<String, dynamic> circular;

  @override
  Widget build(BuildContext context) {
    final published = circular['publishedAt'] as String?;
    final (icon, tone) = _audienceStyle(circular['audience'] as String?);

    return AppSurface(
      clip: true,
      child: IntrinsicHeight(
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Container(width: 4, color: toneColor(tone)),
            Expanded(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(AppSpacing.lg, AppSpacing.lg, AppSpacing.lg, AppSpacing.lg),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        ToneBadge(_audienceLabel(circular['audience'] as String?), tone: tone, icon: icon),
                        const Spacer(),
                        if (published != null)
                          Text(
                            formatDay(published),
                            style: const TextStyle(
                              color: AppColors.ink3,
                              fontSize: 12,
                              fontWeight: FontWeight.w500,
                            ),
                          ),
                      ],
                    ),
                    const SizedBox(height: AppSpacing.md),
                    Text(
                      circular['title'] as String? ?? '',
                      style: const TextStyle(
                        fontWeight: FontWeight.w800,
                        fontSize: 17,
                        height: 1.3,
                        letterSpacing: -0.45,
                      ),
                    ),
                    const SizedBox(height: AppSpacing.sm),
                    Text(
                      circular['body'] as String? ?? '',
                      style: const TextStyle(color: AppColors.ink2, fontSize: 13.5, height: 1.55),
                    ),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
