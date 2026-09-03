import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/auth/auth_state.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/app_widgets.dart';
import 'chat_thread_screen.dart';

final chatContactsProvider = FutureProvider((ref) async {
  final api = ref.watch(apiClientProvider);
  final data = await api.get<Map<String, dynamic>>('/chat/contacts');
  return (data['contacts'] as List).cast<Map<String, dynamic>>();
});

const _groupOrder = [
  'Your children',
  'Families you teach',
  'Parents',
  'The office',
  'Accounts',
  'Colleagues',
];

/// Mirrors src/app/app/chat/new/page.tsx: every person this account may
/// write to, grouped the same way. The list comes straight from the school's
/// own relationships (who teaches whom, whose child is whose) via
/// GET /chat/contacts — never a directory search — so every row here is
/// already allowed; src/lib/core/chat-core.ts's rules are baked into which
/// contacts (and which studentId per contact) the server hands back.
/// Searchable by name and filterable to one relationship group, both
/// client-side over that one call, since a school's whole contactable set is
/// small enough to load in one shot but can still run to a long scroll for
/// a class teacher with many families.
class ChatNewScreen extends ConsumerStatefulWidget {
  const ChatNewScreen({super.key});

  @override
  ConsumerState<ChatNewScreen> createState() => _ChatNewScreenState();
}

class _ChatNewScreenState extends ConsumerState<ChatNewScreen> {
  final _searchController = TextEditingController();
  String _query = '';
  String _group = '_ALL';

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final result = ref.watch(chatContactsProvider);

    return Scaffold(
      appBar: AppTopBar(title: 'New chat'),
      body: result.when(
        loading: () =>
            const AppListSkeleton(hasLeading: true, hasTrailing: false),
        error: (err, _) => ErrorView(
          error: err,
          onRetry: () => ref.invalidate(chatContactsProvider),
        ),
        data: (all) {
          if (all.isEmpty) {
            return const EmptyState(
              icon: Icons.person_search_outlined,
              title: 'No contacts',
              message: 'There is nobody you can message right now.',
            );
          }

          final allGroups =
              {for (final c in all) (c['group'] as String? ?? 'Other')}.toList()
                ..sort((a, b) {
                  final ia = _groupOrder.contains(a)
                      ? _groupOrder.indexOf(a)
                      : 99;
                  final ib = _groupOrder.contains(b)
                      ? _groupOrder.indexOf(b)
                      : 99;
                  return ia.compareTo(ib);
                });
          final groupTabs = ['_ALL', ...allGroups];
          if (!groupTabs.contains(_group)) _group = '_ALL';

          final q = _query.trim().toLowerCase();
          final contacts = all.where((c) {
            if (_group != '_ALL' &&
                (c['group'] as String? ?? 'Other') != _group) {
              return false;
            }
            if (q.isEmpty) return true;
            final haystack =
                '${c['name']} ${c['role'] ?? ''} ${c['studentName'] ?? ''}'
                    .toLowerCase();
            return haystack.contains(q);
          }).toList();

          final groups = <String, List<Map<String, dynamic>>>{};
          for (final c in contacts) {
            groups
                .putIfAbsent(c['group'] as String? ?? 'Other', () => [])
                .add(c);
          }
          final orderedGroups = groups.keys.toList()
            ..sort((a, b) {
              final ia = _groupOrder.contains(a) ? _groupOrder.indexOf(a) : 99;
              final ib = _groupOrder.contains(b) ? _groupOrder.indexOf(b) : 99;
              return ia.compareTo(ib);
            });

          return Column(
            children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(
                  AppSpacing.page,
                  AppSpacing.xs,
                  AppSpacing.page,
                  AppSpacing.sm,
                ),
                child: AppSearchField(
                  controller: _searchController,
                  hintText: 'Search by name',
                  onChanged: (value) => setState(() => _query = value),
                  textInputAction: TextInputAction.search,
                ),
              ),
              if (allGroups.length > 1)
                Padding(
                  padding: const EdgeInsets.only(bottom: AppSpacing.sm),
                  child: AppFilterBar(
                    labels: [
                      for (final g in groupTabs) g == '_ALL' ? 'All' : g,
                    ],
                    selectedIndex: groupTabs.indexOf(_group),
                    onSelected: (index) =>
                        setState(() => _group = groupTabs[index]),
                  ),
                ),
              Expanded(
                child: contacts.isEmpty
                    ? const EmptyState(
                        icon: Icons.person_search_outlined,
                        title: 'No matches',
                        message: 'Try a different search or filter.',
                      )
                    : ListView(
                        padding: const EdgeInsets.symmetric(vertical: 8),
                        children: [
                          for (final group in orderedGroups) ...[
                            Padding(
                              padding: const EdgeInsets.fromLTRB(20, 16, 20, 4),
                              child: Eyebrow(group),
                            ),
                            for (final contact in groups[group]!)
                              _ContactRow(contact: contact),
                          ],
                        ],
                      ),
              ),
            ],
          );
        },
      ),
    );
  }
}

class _ContactRow extends StatelessWidget {
  const _ContactRow({required this.contact});

  final Map<String, dynamic> contact;

  @override
  Widget build(BuildContext context) {
    final name = contact['name'] as String? ?? '—';
    return AppListRow(
      leading: AppAvatar(name: name, size: 42),
      title: name,
      subtitle: contact['role'] as String? ?? '',
      showChevron: true,
      // Straight into the thread UI, empty and ready to type — same as
      // tapping a contact in WhatsApp. No separate compose step: the thread
      // itself is only created once the first message is actually sent, from
      // inside ChatThreadScreen.
      onTap: () => Navigator.of(context).push(
        MaterialPageRoute(
          builder: (_) => ChatThreadScreen(contact: contact, title: name),
        ),
      ),
    );
  }
}
