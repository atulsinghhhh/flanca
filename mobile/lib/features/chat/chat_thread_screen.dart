import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../core/auth/auth_state.dart';
import '../../core/network/api_exception.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/app_widgets.dart';
import 'chat_inbox_screen.dart';

final _threadProvider = FutureProvider
    .family<Map<String, dynamic>, String>((ref, threadId) async {
      final api = ref.watch(apiClientProvider);
      try {
        return await api.get<Map<String, dynamic>>('/chat/threads/$threadId');
      } on ApiException catch (e) {
        if (e.code == 'oversight_required') {
          // Office viewing a conversation they're not part of: the read only
          // happens through this audited endpoint, never the plain GET.
          return api.post<Map<String, dynamic>>(
            '/chat/threads/$threadId/oversight',
          );
        }
        rethrow;
      }
    });

String _messageTime(String iso) =>
    DateFormat.jm().format(DateTime.parse(iso).toLocal());

String _dateLabel(DateTime day) {
  final now = DateTime.now();
  final today = DateTime(now.year, now.month, now.day);
  final that = DateTime(day.year, day.month, day.day);
  final diff = today.difference(that).inDays;
  if (diff == 0) return 'Today';
  if (diff == 1) return 'Yesterday';
  return DateFormat('d MMMM yyyy').format(that);
}

/// Mirrors src/app/app/chat/[threadId]/page.tsx + composer.tsx, styled like a
/// familiar messaging app — bubbles, per-day dividers, a pill composer —
/// since that's the mental model everyone already has for "chat". No feature
/// beyond what the API supports: there is no per-message read receipt in the
/// backend, so bubbles show a sent mark, never a WhatsApp-style read tick.
///
/// Doubles as the "new chat" screen: pass `contact` instead of `threadId` and
/// this opens straight into the empty thread view, exactly like tapping a
/// contact in WhatsApp. The thread itself isn't created until the first
/// message is actually sent — `_send` calls POST /chat/threads instead of
/// POST /chat/threads/:id/messages while `_threadId` is still null, then
/// switches over once the backend hands back a real id.
class ChatThreadScreen extends ConsumerStatefulWidget {
  const ChatThreadScreen({
    super.key,
    this.threadId,
    required this.title,
    this.contact,
  }) : assert(
         threadId != null || contact != null,
         'Provide either an existing threadId or a contact to start with.',
       );

  final String? threadId;
  final String title;

  /// Only set when this screen was opened from the contact picker rather
  /// than an existing thread. Needs `userId` and, optionally, `studentId`
  /// and `role` (for the subtitle).
  final Map<String, dynamic>? contact;

  @override
  ConsumerState<ChatThreadScreen> createState() => _ChatThreadScreenState();
}

class _ChatThreadScreenState extends ConsumerState<ChatThreadScreen> {
  final _bodyController = TextEditingController();
  bool _sending = false;
  String? _threadId;

  @override
  void initState() {
    super.initState();
    _threadId = widget.threadId;
    if (_threadId != null) _markRead(_threadId!);
  }

  void _markRead(String threadId) {
    Future.microtask(() async {
      try {
        final api = ref.read(apiClientProvider);
        await api.post('/chat/threads/$threadId/read');
        ref.invalidate(chatInboxProvider);
      } on ApiException {
        // Best-effort — not marking read shouldn't block viewing the thread.
      }
    });
  }

  @override
  void dispose() {
    _bodyController.dispose();
    super.dispose();
  }

  Future<void> _send() async {
    final body = _bodyController.text.trim();
    if (body.isEmpty) return;
    setState(() => _sending = true);
    try {
      final api = ref.read(apiClientProvider);
      final threadId = _threadId;
      if (threadId == null) {
        final contact = widget.contact!;
        final result = await api.post<Map<String, dynamic>>(
          '/chat/threads',
          data: {
            'targetUserId': contact['userId'],
            'studentId': contact['studentId'],
            'body': body,
          },
        );
        _bodyController.clear();
        ref.invalidate(chatInboxProvider);
        if (mounted) setState(() => _threadId = result['threadId'] as String);
      } else {
        await api.post(
          '/chat/threads/$threadId/messages',
          data: {'body': body},
        );
        _bodyController.clear();
        ref.invalidate(_threadProvider(threadId));
      }
    } on ApiException catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(e.message)));
      }
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final threadId = _threadId;
    final thread = threadId == null
        ? null
        : ref.watch(_threadProvider(threadId));
    final canPost = thread?.maybeWhen(
          data: (data) => data['canPost'] as bool? ?? true,
          orElse: () => true,
        ) ??
        true;
    final kind = thread?.maybeWhen(
      data: (data) => data['kind'] as String?,
      orElse: () => null,
    );
    final theirRole = thread?.maybeWhen(
          data: (data) => data['theirRole'] as String?,
          orElse: () => null,
        ) ??
        widget.contact?['role'] as String?;

    return Scaffold(
      appBar: AppTopBar(
        title: widget.title,
        subtitle: theirRole,
        actions: [
          // The person you're talking to, as the one thing in the bar that
          // isn't a control — it keeps a long thread anchored to a face.
          AppAvatar(name: widget.title, size: 38, tone: Tone.brand),
        ],
      ),
      body: Column(
        children: [
          Expanded(
            child: Container(
              color: AppColors.paper2,
              child: thread == null
                  ? const EmptyState(
                      icon: Icons.chat_bubble_outlined,
                      title: 'No messages yet',
                      message: 'Send the first message to start this conversation.',
                    )
                  : thread.when(
                loading: () => const AppCardsSkeleton(),
                error: (err, _) => ErrorView(
                  error: err,
                  onRetry: () =>
                      ref.invalidate(_threadProvider(threadId!)),
                ),
                data: (data) {
                  final messages = (data['messages'] as List)
                      .cast<Map<String, dynamic>>();
                  final closed = data['closedAt'] != null;

                  if (messages.isEmpty) {
                    return const EmptyState(
                      icon: Icons.chat_bubble_outlined,
                      title: 'No messages yet', message: 'Send the first message to start this conversation.',
                    );
                  }

                  // Chronological order (oldest first). Insert a date-label item
                  // wherever the calendar day changes, then reverse for display
                  // so the ListView can stay `reverse: true` and open scrolled
                  // to the newest message without a manual ScrollController.
                  final items = <Object>[];
                  DateTime? lastDay;
                  for (final m in messages) {
                    final sentAt = DateTime.parse(m['createdAt'] as String)
                        .toLocal();
                    final day = DateTime(sentAt.year, sentAt.month, sentAt.day);
                    if (lastDay == null || day != lastDay) {
                      items.add(day);
                      lastDay = day;
                    }
                    items.add(m);
                  }
                  final reversed = items.reversed.toList();

                  return Column(
                    children: [
                      if (closed)
                        const Padding(
                          padding: EdgeInsets.fromLTRB(
                            AppSpacing.md,
                            AppSpacing.md,
                            AppSpacing.md,
                            0,
                          ),
                          child: AppBanner(
                            message: 'This conversation is closed.',
                            tone: Tone.warn,
                            icon: Icons.lock_outlined,
                          ),
                        ),
                      Expanded(
                        child: ListView.builder(
                          reverse: true,
                          padding: const EdgeInsets.symmetric(
                            horizontal: 12,
                            vertical: 10,
                          ),
                          itemCount: reversed.length,
                          itemBuilder: (context, index) {
                            final item = reversed[index];
                            if (item is DateTime) return _DateChip(day: item);
                            return _MessageBubble(
                              message: item as Map<String, dynamic>,
                            );
                          },
                        ),
                      ),
                    ],
                  );
                },
              ),
            ),
          ),
          if (kind == 'GROUP' && !canPost)
            Container(
              width: double.infinity,
              color: AppColors.paper2,
              child: const SafeArea(
                top: false,
                child: Padding(
                  padding: EdgeInsets.all(AppSpacing.md),
                  child: AppBanner(
                    message: "Announcements only — replies aren't open in this channel.",
                    tone: Tone.neutral,
                    icon: Icons.campaign_outlined,
                  ),
                ),
              ),
            )
          else
            // The composer sits on the card ground with a hairline above it,
            // so it reads as a fixed bar rather than floating on the same
            // paper2 wash the message list uses.
            DecoratedBox(
              decoration: const BoxDecoration(
                color: AppColors.card,
                boxShadow: AppShadows.raised,
              ),
              child: SafeArea(
                top: false,
                child: Padding(
                  padding: const EdgeInsets.all(AppSpacing.md),
                  child: Row(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    Expanded(
                      child: Container(
                        constraints: const BoxConstraints(maxHeight: 120),
                        decoration: BoxDecoration(
                          color: AppColors.paper2,
                          borderRadius: BorderRadius.circular(AppRadius.xl),
                        ),
                        child: TextField(
                          controller: _bodyController,
                          decoration: const InputDecoration(
                            hintText: 'Message',
                            border: InputBorder.none,
                            enabledBorder: InputBorder.none,
                            focusedBorder: InputBorder.none,
                            filled: false,
                            isDense: true,
                            contentPadding: EdgeInsets.symmetric(
                              horizontal: 18,
                              vertical: 13,
                            ),
                          ),
                          style: const TextStyle(fontSize: 15, height: 1.35),
                          minLines: 1,
                          maxLines: 5,
                          textCapitalization: TextCapitalization.sentences,
                        ),
                      ),
                    ),
                    const SizedBox(width: AppSpacing.sm + 2),
                    // The send key carries the brand lift the rest of the app
                    // gives its one primary action, and dips under the finger.
                    AppPressable(
                      onTap: _sending ? null : _send,
                      borderRadius: BorderRadius.circular(AppRadius.pill),
                      scale: 0.92,
                      child: Ink(
                        decoration: const BoxDecoration(
                          color: AppColors.brand,
                          shape: BoxShape.circle,
                          boxShadow: AppShadows.brand,
                        ),
                        child: Padding(
                          padding: const EdgeInsets.all(14),
                          child: _sending
                              ? const SizedBox(
                                  height: 20,
                                  width: 20,
                                  child: CircularProgressIndicator(
                                    strokeWidth: 2,
                                    color: Colors.white,
                                  ),
                                )
                              : const Icon(
                                  Icons.send_rounded,
                                  color: Colors.white,
                                  size: 20,
                                ),
                        ),
                      ),
                    ),
                  ],
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }
}

class _DateChip extends StatelessWidget {
  const _DateChip({required this.day});

  final DateTime day;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Container(
        margin: const EdgeInsets.symmetric(vertical: AppSpacing.sm + 2),
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
        decoration: BoxDecoration(
          color: AppColors.card,
          borderRadius: BorderRadius.circular(AppRadius.pill),
          boxShadow: AppShadows.card,
        ),
        child: Text(
          _dateLabel(day),
          style: const TextStyle(
            fontSize: 11.5,
            color: AppColors.ink3,
            fontWeight: FontWeight.w700,
            letterSpacing: 0.1,
          ),
        ),
      ),
    );
  }
}

class _MessageBubble extends StatelessWidget {
  const _MessageBubble({required this.message});

  final Map<String, dynamic> message;

  @override
  Widget build(BuildContext context) {
    final mine = message['mine'] as bool? ?? false;
    final time = _messageTime(message['createdAt'] as String);

    return Align(
      alignment: mine ? Alignment.centerRight : Alignment.centerLeft,
      child: Container(
        margin: const EdgeInsets.symmetric(vertical: 3),
        padding: const EdgeInsets.fromLTRB(14, 10, 12, 7),
        constraints: BoxConstraints(
          // Caps the bubble on a tablet, where 78% of the window would run a
          // one-line message across most of the screen.
          maxWidth: (MediaQuery.sizeOf(context).width * 0.78).clamp(0.0, 520.0),
        ),
        decoration: BoxDecoration(
          color: mine ? AppColors.brand : AppColors.card,
          borderRadius: BorderRadius.only(
            topLeft: const Radius.circular(AppRadius.lg),
            topRight: const Radius.circular(AppRadius.lg),
            bottomLeft: Radius.circular(mine ? AppRadius.lg : 4),
            bottomRight: Radius.circular(mine ? 4 : AppRadius.lg),
          ),
          // A soft lift instead of a hairline: on the paper2 chat ground a 1px
          // border reads as a cut-out, a shadow reads as a card.
          boxShadow: mine ? AppShadows.brand : AppShadows.card,
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            if (!mine)
              Padding(
                padding: const EdgeInsets.only(bottom: 2),
                child: Text(
                  message['senderName'] as String? ?? '',
                  style: const TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w800,
                    letterSpacing: -0.1,
                    color: AppColors.brandDark,
                  ),
                ),
              ),
            Text(
              message['body'] as String? ?? '',
              style: TextStyle(
                color: mine ? Colors.white : AppColors.ink,
                fontSize: 14.5,
                height: 1.35,
              ),
            ),
            const SizedBox(height: 2),
            Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  time,
                  style: TextStyle(
                    fontSize: 10.5,
                    color: mine
                        ? Colors.white.withValues(alpha: 0.75)
                        : AppColors.ink3,
                  ),
                ),
                if (mine) ...[
                  const SizedBox(width: 3),
                  Icon(
                    Icons.done_all_rounded,
                    size: 14,
                    color: Colors.white.withValues(alpha: 0.75),
                  ),
                ],
              ],
            ),
          ],
        ),
      ),
    );
  }
}
