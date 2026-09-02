import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../core/auth/auth_state.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/app_widgets.dart';
import 'chat_new_screen.dart';
import 'chat_thread_screen.dart';

final chatInboxProvider = FutureProvider.autoDispose((ref) async {
  final api = ref.watch(apiClientProvider);
  final data = await api.get<Map<String, dynamic>>('/chat/threads');
  return (data['threads'] as List).cast<Map<String, dynamic>>();
});

/// This account's standing announcement channels — a student's class channel
/// plus one per subject; a teacher's own class/subject channels. Hitting this
/// also creates any channel that doesn't exist yet and syncs in anyone new to
/// the roster, so opening Chat is enough to make a channel discoverable —
/// nobody has to "create the class group" as a separate step.
final channelsProvider = FutureProvider.autoDispose((ref) async {
  final api = ref.watch(apiClientProvider);
  final data = await api.get<Map<String, dynamic>>('/chat/groups');
  return (data['channels'] as List).cast<Map<String, dynamic>>();
});

/// A WhatsApp-style relative stamp: time if it's today, "Yesterday", the
/// weekday within the last week, otherwise a short date.
String _relativeTime(String iso) {
  final dt = DateTime.parse(iso).toLocal();
  final now = DateTime.now();
  final today = DateTime(now.year, now.month, now.day);
  final that = DateTime(dt.year, dt.month, dt.day);
  final diff = today.difference(that).inDays;
  if (diff == 0) return DateFormat.jm().format(dt);
  if (diff == 1) return 'Yesterday';
  if (diff < 7) return DateFormat.E().format(dt);
  return DateFormat('d/M/yy').format(dt);
}

/// Mirrors src/app/app/chat/page.tsx — conversations this person is in, most
/// recently spoken in first.
///
/// Channels and direct threads now sit in two clearly separated panels with
/// their own leading shapes — a rounded square for a channel, a circle for a
/// person — so a broadcast channel is never mistaken for a conversation.
class ChatInboxScreen extends ConsumerStatefulWidget {
  const ChatInboxScreen({super.key});

  @override
  ConsumerState<ChatInboxScreen> createState() => _ChatInboxScreenState();
}

class _ChatInboxScreenState extends ConsumerState<ChatInboxScreen> {
  final _searchController = TextEditingController();
  String _query = '';

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final inbox = ref.watch(chatInboxProvider);
    final channels = ref.watch(channelsProvider);

    return Scaffold(
      appBar: const AppTopBar(title: 'Connect'),
      floatingActionButton: AppFab(
        tooltip: 'New chat',
        icon: Icons.edit_outlined,
        onPressed: () =>
            Navigator.of(context)
                .push(MaterialPageRoute(builder: (_) => const ChatNewScreen())),
      ),
      body: RefreshIndicator(
        onRefresh: () async {
          ref.invalidate(chatInboxProvider);
          ref.invalidate(channelsProvider);
        },
        color: AppColors.brand,
        backgroundColor: AppColors.card,
        child: inbox.when(
          loading: () => const AppListSkeleton(hasLeading: true),
          error: (err, _) => ErrorView(
            error: err,
            onRetry: () => ref.invalidate(chatInboxProvider),
          ),
          data: (threads) {
            final directThreads = threads
                .where((t) => t['kind'] != 'GROUP')
                .toList();
            final channelList = channels.maybeWhen(
              data: (c) => c,
              orElse: () => const <Map<String, dynamic>>[],
            );

            if (directThreads.isEmpty && channelList.isEmpty) {
              return const EmptyState(
                icon: Icons.forum_outlined,
                title: 'No conversations',
                message: 'Start one and it will appear here.',
              );
            }

            final query = _query.trim().toLowerCase();
            final filteredChannels = query.isEmpty
                ? channelList
                : channelList
                    .where((c) => (c['label'] as String? ?? '').toLowerCase().contains(query))
                    .toList();
            final filteredThreads = query.isEmpty
                ? directThreads
                : directThreads
                    .where((t) {
                      final name = (t['with'] as String? ?? '').toLowerCase();
                      final role = (t['theirRole'] as String? ?? '').toLowerCase();
                      return name.contains(query) || role.contains(query);
                    })
                    .toList();
            final noResults = query.isNotEmpty && filteredChannels.isEmpty && filteredThreads.isEmpty;

            return ListView(
              physics: const AlwaysScrollableScrollPhysics(),
              // Clears the floating action button and the tab bar, which
              // previously sat on top of the last row.
              padding: const EdgeInsets.fromLTRB(
                AppSpacing.page,
                AppSpacing.sm,
                AppSpacing.page,
                AppSpacing.bottomSafe,
              ),
              children: [
                AppSearchField(
                  controller: _searchController,
                  hintText: 'Search channels and people',
                  onChanged: (v) => setState(() => _query = v),
                ),
                const SizedBox(height: AppSpacing.lg),
                if (noResults)
                  const Padding(
                    padding: EdgeInsets.only(top: AppSpacing.xl),
                    child: EmptyState(
                      icon: Icons.search_off_rounded,
                      title: 'No matches',
                      message: 'Try a different name.',
                    ),
                  ),
                if (filteredChannels.isNotEmpty) ...[
                  SectionHeader('Channels', count: filteredChannels.length),
                  const SizedBox(height: AppSpacing.md),
                  AppSurface(
                    clip: true,
                    child: Column(
                      children: [
                        for (var i = 0; i < filteredChannels.length; i++) ...[
                          _ChannelRow(channel: filteredChannels[i]),
                          if (i < filteredChannels.length - 1)
                            const Divider(height: 1, indent: _rowIndent, endIndent: AppSpacing.lg),
                        ],
                      ],
                    ),
                  ),
                ],
                if (filteredThreads.isNotEmpty) ...[
                  // The second group gets a label too — previously only the
                  // channels were titled, so the direct threads below the
                  // divider read as an unexplained second list.
                  SizedBox(height: filteredChannels.isEmpty ? 0 : AppSpacing.xl),
                  SectionHeader('Messages', count: filteredThreads.length),
                  const SizedBox(height: AppSpacing.md),
                  AppSurface(
                    clip: true,
                    child: Column(
                      children: [
                        for (var i = 0; i < filteredThreads.length; i++) ...[
                          _ThreadRow(thread: filteredThreads[i]),
                          if (i < filteredThreads.length - 1)
                            const Divider(height: 1, indent: _rowIndent, endIndent: AppSpacing.lg),
                        ],
                      ],
                    ),
                  ),
                ],
              ],
            );
          },
        ),
      ),
    );
  }
}

/// Page gutter + 46px leading shape + gap: where the dividers in both panels
/// start, so the rule always begins under the text.
const _rowIndent = AppSpacing.lg + 46 + 14;

class _ThreadRow extends StatelessWidget {
  const _ThreadRow({required this.thread});

  final Map<String, dynamic> thread;

  @override
  Widget build(BuildContext context) {
    final unread = thread['unread'] as int? ?? 0;
    final name = thread['with'] as String? ?? '—';
    final theirRole = thread['theirRole'] as String?;
    final lastMessageAt = thread['lastMessageAt'] as String?;
    final hasUnread = unread > 0;

    return AppPressable(
      scale: 0.99,
      onTap: () => Navigator.of(context).push(
        MaterialPageRoute(
          builder: (_) => ChatThreadScreen(
            threadId: thread['threadId'] as String,
            title: name,
          ),
        ),
      ),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: AppSpacing.lg, vertical: 14),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            AppAvatar(name: name, size: 46),
            const SizedBox(width: 14),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Row(
                    children: [
                      Flexible(
                        child: Text(
                          name,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(
                            fontSize: 15,
                            letterSpacing: -0.2,
                            fontWeight: hasUnread ? FontWeight.w800 : FontWeight.w600,
                          ),
                        ),
                      ),
                      if (theirRole != null) ...[
                        const SizedBox(width: 6),
                        Flexible(
                          child: Text(
                            '· $theirRole',
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(
                              color: AppColors.ink3,
                              fontSize: 12,
                              fontWeight: FontWeight.w500,
                            ),
                          ),
                        ),
                      ],
                    ],
                  ),
                  Padding(
                    padding: const EdgeInsets.only(top: 3),
                    child: Text(
                      thread['preview'] as String? ?? thread['about'] as String? ?? '',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                        fontSize: 13,
                        height: 1.35,
                        color: hasUnread ? AppColors.ink2 : AppColors.ink3,
                        fontWeight: hasUnread ? FontWeight.w600 : FontWeight.w400,
                      ),
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(width: AppSpacing.md),
            // A fixed column width: the timestamp used to shift horizontally
            // depending on whether an unread badge was present beneath it.
            SizedBox(
              width: 52,
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  if (lastMessageAt != null)
                    Text(
                      _relativeTime(lastMessageAt),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                        fontSize: 11.5,
                        color: hasUnread ? AppColors.brand : AppColors.ink3,
                        fontWeight: hasUnread ? FontWeight.w700 : FontWeight.w500,
                      ),
                    ),
                  const SizedBox(height: 7),
                  if (hasUnread)
                    Container(
                      constraints: const BoxConstraints(minWidth: 22),
                      alignment: Alignment.center,
                      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 3),
                      decoration: BoxDecoration(
                        color: AppColors.brand,
                        borderRadius: BorderRadius.circular(AppRadius.pill),
                        boxShadow: AppShadows.brand,
                      ),
                      child: Text(
                        unread > 99 ? '99+' : '$unread',
                        style: const TextStyle(
                          fontSize: 11,
                          color: Colors.white,
                          fontWeight: FontWeight.w800,
                          height: 1.3,
                        ),
                      ),
                    ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _ChannelRow extends StatelessWidget {
  const _ChannelRow({required this.channel});

  final Map<String, dynamic> channel;

  @override
  Widget build(BuildContext context) {
    final kind = channel['kind'] as String? ?? 'CLASS';
    final label = channel['label'] as String? ?? 'Channel';
    final canPost = channel['canPost'] as bool? ?? false;

    return AppPressable(
      scale: 0.99,
      onTap: () => Navigator.of(context).push(
        MaterialPageRoute(
          builder: (_) => ChatThreadScreen(
            threadId: channel['threadId'] as String,
            title: label,
          ),
        ),
      ),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: AppSpacing.lg, vertical: 14),
        child: Row(
          children: [
            // A rounded square, not a circle: the shape alone separates a
            // broadcast channel from a person at a glance.
            Container(
              width: 46,
              height: 46,
              alignment: Alignment.center,
              decoration: BoxDecoration(
                color: AppColors.brandLight,
                borderRadius: BorderRadius.circular(AppRadius.sm),
              ),
              child: Icon(
                kind == 'SUBJECT' ? Icons.menu_book_outlined : Icons.groups_outlined,
                color: AppColors.brand,
                size: 22,
              ),
            ),
            const SizedBox(width: 14),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    label,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15, letterSpacing: -0.2),
                  ),
                  Padding(
                    padding: const EdgeInsets.only(top: 3),
                    child: Text(
                      canPost ? 'You can post announcements here' : 'Announcements only',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(fontSize: 12.5, color: AppColors.ink3, height: 1.35),
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(width: AppSpacing.sm),
            const Icon(Icons.chevron_right_rounded, color: AppColors.line2, size: 22),
          ],
        ),
      ),
    );
  }
}
