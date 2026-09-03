import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/auth/auth_state.dart';
import '../../core/network/api_exception.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/app_widgets.dart';
import '../home/home_screen.dart' show unreadNotificationsProvider;

final notificationsProvider = FutureProvider((ref) async {
  final api = ref.watch(apiClientProvider);
  return api.get<Map<String, dynamic>>('/notifications');
});

/// Mirrors src/app/app/notifications/page.tsx + notification-list.tsx.
/// Filterable to just the unread ones, since the last 20 quickly buries a
/// couple of unread items under a week of already-seen ones.
class NotificationsScreen extends ConsumerStatefulWidget {
  const NotificationsScreen({super.key});

  @override
  ConsumerState<NotificationsScreen> createState() =>
      _NotificationsScreenState();
}

class _NotificationsScreenState extends ConsumerState<NotificationsScreen> {
  bool _unreadOnly = false;

  Future<void> _markAllRead() async {
    final api = ref.read(apiClientProvider);
    try {
      await api.post('/notifications/read-all');
    } on ApiException {
      // Best-effort.
    }
    ref.invalidate(notificationsProvider);
    ref.invalidate(unreadNotificationsProvider);
  }

  Future<void> _markRead(String id) async {
    final api = ref.read(apiClientProvider);
    try {
      await api.post('/notifications/$id/read');
    } on ApiException {
      // Best-effort.
    }
    ref.invalidate(notificationsProvider);
    ref.invalidate(unreadNotificationsProvider);
  }

  @override
  Widget build(BuildContext context) {
    final list = ref.watch(notificationsProvider);

    return Scaffold(
      appBar: AppTopBar(
        title: 'Notifications',
        actions: [
          TextButton(
            onPressed: _markAllRead,
            child: const Text('Mark all read'),
          ),
        ],
      ),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(
              AppSpacing.page,
              AppSpacing.xs,
              AppSpacing.page,
              0,
            ),
            child: AppFilterBar(
              labels: const ['All', 'Unread'],
              selectedIndex: _unreadOnly ? 1 : 0,
              onSelected: (index) => setState(() => _unreadOnly = index == 1),
            ),
          ),
          Expanded(
            child: RefreshIndicator(
              onRefresh: () async => ref.invalidate(notificationsProvider),
              color: AppColors.brand,
              backgroundColor: AppColors.card,
              child: list.when(
                loading: () => const AppListSkeleton(hasTrailing: false),
                error: (err, _) => ErrorView(
                  error: err,
                  onRetry: () => ref.invalidate(notificationsProvider),
                ),
                data: (data) {
                  final all = (data['notifications'] as List)
                      .cast<Map<String, dynamic>>();
                  final items = _unreadOnly
                      ? all.where((n) => n['readAt'] == null).toList()
                      : all;
                  if (items.isEmpty) {
                    return EmptyState(
                      icon: Icons.notifications_none_rounded,
                      title: all.isEmpty
                          ? 'No notifications'
                          : 'Nothing unread',
                      message: all.isEmpty
                          ? "Anything the school sends you will show up here."
                          : "You're all caught up.",
                    );
                  }
                  return ListView.separated(
                    physics: const AlwaysScrollableScrollPhysics(),
                    padding: const EdgeInsets.fromLTRB(
                      AppSpacing.page,
                      AppSpacing.sm,
                      AppSpacing.page,
                      AppSpacing.xxl,
                    ),
                    itemCount: items.length,
                    separatorBuilder: (_, _) =>
                        const SizedBox(height: AppSpacing.md),
                    itemBuilder: (context, index) {
                      final n = items[index];
                      final unread = n['readAt'] == null;
                      return AppFadeIn(
                        delay: AppFadeIn.stagger(index),
                        child: _NotificationRow(
                          title: n['title'] as String? ?? '',
                          body: n['body'] as String? ?? '',
                          unread: unread,
                          onTap: unread
                              ? () => _markRead(n['id'] as String)
                              : null,
                        ),
                      );
                    },
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

/// One notification, as its own card rather than a row in a divided list.
///
/// Unread is carried three ways — a brand rail down the leading edge, a bell
/// medallion in brand rather than grey, and a weight change on the title — so
/// the state survives a glance, a greyscale screenshot and a colour-blind
/// reader. Read items drop to a flat surface and recede.
class _NotificationRow extends StatelessWidget {
  const _NotificationRow({
    required this.title,
    required this.body,
    required this.unread,
    required this.onTap,
  });

  final String title;
  final String body;
  final bool unread;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    return AppSurface(
      clip: true,
      onTap: onTap,
      shadows: unread ? AppShadows.card : const [],
      color: unread ? AppColors.card : AppColors.paper2,
      child: IntrinsicHeight(
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Container(
              width: 3,
              color: unread ? AppColors.brand : Colors.transparent,
            ),
            Expanded(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(
                  AppSpacing.md,
                  AppSpacing.lg,
                  AppSpacing.lg,
                  AppSpacing.lg,
                ),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Container(
                      width: 36,
                      height: 36,
                      alignment: Alignment.center,
                      decoration: BoxDecoration(
                        color: unread
                            ? AppColors.brandLight
                            : AppColors.line.withValues(alpha: 0.5),
                        borderRadius: BorderRadius.circular(AppRadius.sm),
                      ),
                      child: Icon(
                        unread
                            ? Icons.notifications_active_outlined
                            : Icons.notifications_none_rounded,
                        size: 18,
                        color: unread ? AppColors.brand : AppColors.ink3,
                      ),
                    ),
                    const SizedBox(width: AppSpacing.md),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Text(
                            title,
                            style: TextStyle(
                              fontWeight: unread
                                  ? FontWeight.w700
                                  : FontWeight.w600,
                              fontSize: 14.5,
                              height: 1.35,
                              letterSpacing: -0.2,
                              color: unread ? AppColors.ink : AppColors.ink2,
                            ),
                          ),
                          if (body.isNotEmpty)
                            Padding(
                              padding: const EdgeInsets.only(top: 3),
                              child: Text(
                                // No maxLines/ellipsis cap: the web list
                                // (notification-list.tsx) never truncates
                                // the body either, and a "..." with no way
                                // to expand meant some notifications could
                                // never be read in full on mobile.
                                body,
                                style: const TextStyle(
                                  color: AppColors.ink3,
                                  fontSize: 13,
                                  height: 1.45,
                                ),
                              ),
                            ),
                        ],
                      ),
                    ),
                    if (unread) ...[
                      const SizedBox(width: AppSpacing.sm),
                      Container(
                        margin: const EdgeInsets.only(top: 6),
                        width: 8,
                        height: 8,
                        decoration: const BoxDecoration(
                          color: AppColors.brand,
                          shape: BoxShape.circle,
                        ),
                      ),
                    ],
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
