import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/auth/auth_state.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/app_widgets.dart';

const _thresholds = [60, 70, 75, 80, 85];

final _shortageProvider = FutureProvider.autoDispose
    .family<Map<String, dynamic>, int>((ref, required) async {
      final api = ref.watch(apiClientProvider);
      return api.get<Map<String, dynamic>>(
        '/attendance/shortage',
        query: {'required': required},
      );
    });

/// Mirrors src/app/app/attendance/shortage/page.tsx: who is below the
/// attendance requirement, worst first, with a tap-to-call for the parent —
/// this is a phone-number report, exactly the kind of thing a phone is for.
class AttendanceShortageScreen extends ConsumerStatefulWidget {
  const AttendanceShortageScreen({super.key});

  @override
  ConsumerState<AttendanceShortageScreen> createState() =>
      _AttendanceShortageScreenState();
}

class _AttendanceShortageScreenState
    extends ConsumerState<AttendanceShortageScreen> {
  int _required = 75;
  final _searchController = TextEditingController();
  String _query = '';

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final result = ref.watch(_shortageProvider(_required));

    return Scaffold(
      appBar: AppTopBar(title: 'Below $_required% attendance'),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.only(top: AppSpacing.sm, bottom: AppSpacing.xs),
            child: AppFilterBar(
              labels: [for (final t in _thresholds) '$t%'],
              selectedIndex: _thresholds.indexOf(_required),
              onSelected: (index) => setState(() => _required = _thresholds[index]),
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(
              AppSpacing.page,
              0,
              AppSpacing.page,
              AppSpacing.sm,
            ),
            child: AppSearchField(
              controller: _searchController,
              hintText: 'Name, class or section',
              onChanged: (value) => setState(() => _query = value),
              textInputAction: TextInputAction.search,
            ),
          ),
          Expanded(
            child: RefreshIndicator(
              onRefresh: () async =>
                  ref.invalidate(_shortageProvider(_required)),
              child: result.when(
                loading: () => const AppListSkeleton(),
                error: (err, _) => ErrorView(
                  error: err,
                  onRetry: () => ref.invalidate(_shortageProvider(_required)),
                ),
                data: (all0) {
                  final allRows = (all0['rows'] as List)
                      .cast<Map<String, dynamic>>();
                  final q = _query.trim().toLowerCase();
                  final rows = q.isEmpty
                      ? allRows
                      : allRows.where((r) {
                          final haystack =
                              '${r['name']} ${r['className'] ?? ''} ${r['sectionName'] ?? ''}'
                                  .toLowerCase();
                          return haystack.contains(q);
                        }).toList();

                  if (rows.isEmpty) {
                    return EmptyState(
                      icon: Icons.emoji_events_outlined,
                      title: allRows.isEmpty ? 'No shortages' : 'No matches',
                      message: allRows.isEmpty
                          ? 'Every student is at or above the $_required% mark.'
                          : 'Try a different search.',
                    );
                  }
                  return ListView.separated(
                    padding: const EdgeInsets.symmetric(vertical: 4),
                    itemCount: rows.length,
                    separatorBuilder: (_, _) => const Divider(
                      height: 1,
                      indent: AppSpacing.page,
                      endIndent: AppSpacing.page,
                    ),
                    itemBuilder: (context, index) =>
                        _ShortageRow(row: rows[index]),
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

class _ShortageRow extends StatelessWidget {
  const _ShortageRow({required this.row});

  final Map<String, dynamic> row;

  @override
  Widget build(BuildContext context) {
    final summary = row['summary'] as Map<String, dynamic>;
    final verdict = row['verdict'] as Map<String, dynamic>;
    final percentBp = summary['percentBp'] as int;
    final unreachable = verdict['unreachable'] as bool? ?? false;
    final phone = row['phone'] as String?;
    final className = row['className'] as String? ?? '';
    final sectionName = row['sectionName'] as String? ?? '';

    return AppListRow(
      leading: AppAvatar(
        name: row['name'] as String,
        size: 40,
        tone: unreachable ? Tone.bad : Tone.warn,
      ),
      title: row['name'] as String,
      subtitle:
          '$className $sectionName · ${(percentBp / 100).toStringAsFixed(1)}%'
                  ' · ${summary['presentDays']}/${summary['workingDays']} days'
              .trim(),
      trailing: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          ToneBadge(
            unreachable ? 'Out of reach' : 'Recoverable',
            tone: unreachable ? Tone.bad : Tone.warn,
          ),
          // Calling the guardian is the action this screen exists for, so it
          // is a real circular target rather than a bare glyph.
          if (phone != null) ...[
            const SizedBox(width: AppSpacing.sm),
            AppIconButton(
              icon: Icons.call_rounded,
              tone: Tone.brand,
              size: 38,
              iconSize: 18,
              tooltip: phone,
              onPressed: () => launchUrl(Uri(scheme: 'tel', path: phone)),
            ),
          ],
        ],
      ),
    );
  }
}
