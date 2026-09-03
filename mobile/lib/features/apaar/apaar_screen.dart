import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/auth/auth_state.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/app_widgets.dart';
import 'apaar_student_screen.dart';

final _apaarCentreProvider = FutureProvider
    .family<Map<String, dynamic>, String?>((ref, state) async {
      final api = ref.watch(apiClientProvider);
      return api.get<Map<String, dynamic>>(
        '/apaar',
        query: state == null ? null : {'state': state},
      );
    });

/// The vocabulary from src/lib/core/apaar-core.ts::APAAR_STATES, in the order
/// a clerk works a roster: collect consent, submit, resolve, done. Public —
/// apaar_student_screen.dart reuses it for the status dropdown.
const apaarStates = [
  'NOT_STARTED',
  'CONSENT_PENDING',
  'CONSENT_REFUSED',
  'SUBMITTED',
  'MISMATCH',
  'ISSUED',
];

String stateLabel(String state) => switch (state) {
  'NOT_STARTED' => 'Not started',
  'CONSENT_PENDING' => 'Consent pending',
  'CONSENT_REFUSED' => 'Consent refused',
  'SUBMITTED' => 'Submitted',
  'MISMATCH' => 'Mismatch',
  'ISSUED' => 'Issued',
  _ => state,
};

Tone _stateTone(String state) => switch (state) {
  'ISSUED' => Tone.good,
  'SUBMITTED' => Tone.info,
  'CONSENT_PENDING' => Tone.warn,
  'CONSENT_REFUSED' => Tone.bad,
  'MISMATCH' => Tone.bad,
  _ => Tone.neutral,
};

/// UDISE+ certification freezes 30 Sep 2026 with every student missing an
/// APAAR ID blocking the whole school — so the closer that freeze gets, the
/// louder this reads.
Tone _freezeTone(int daysToFreeze) {
  if (daysToFreeze <= 7) return Tone.bad;
  if (daysToFreeze <= 30) return Tone.warn;
  return Tone.good;
}

/// Mirrors src/app/app/apaar/page.tsx: the APAAR / UDISE+ compliance centre —
/// coverage against the freeze deadline, and every student still blocking
/// certification, with a way to fix each one.
class ApaarScreen extends ConsumerStatefulWidget {
  const ApaarScreen({super.key});

  @override
  ConsumerState<ApaarScreen> createState() => _ApaarScreenState();
}

class _ApaarScreenState extends ConsumerState<ApaarScreen> {
  String? _stateFilter;

  void _reload() => ref.invalidate(_apaarCentreProvider(_stateFilter));

  @override
  Widget build(BuildContext context) {
    final centre = ref.watch(_apaarCentreProvider(_stateFilter));

    return Scaffold(
      appBar: AppTopBar(title: 'APAAR / UDISE+'),
      body: RefreshIndicator(
        onRefresh: () async => _reload(),
        child: centre.when(
          loading: () => const AppCardsSkeleton(),
          error: (err, _) => ErrorView(error: err, onRetry: _reload),
          data: (data) {
            final coverage = data['coverage'] as Map<String, dynamic>;
            final daysToFreeze = data['daysToFreeze'] as int;
            final classSummary = (data['classSummary'] as List)
                .cast<Map<String, dynamic>>();
            final rows = (data['rows'] as List).cast<Map<String, dynamic>>();

            return ListView(
              padding: const EdgeInsets.symmetric(vertical: 12),
              children: [
                Padding(
                  padding: const EdgeInsets.symmetric(
                    horizontal: AppSpacing.page,
                  ),
                  child: _CoverageCard(
                    coverage: coverage,
                    daysToFreeze: daysToFreeze,
                  ),
                ),
                if (classSummary.isNotEmpty) ...[
                  const SizedBox(height: 12),
                  SizedBox(
                    height: 40,
                    child: ListView.separated(
                      scrollDirection: Axis.horizontal,
                      padding: const EdgeInsets.symmetric(
                        horizontal: AppSpacing.page,
                      ),
                      itemCount: classSummary.length,
                      separatorBuilder: (_, _) => const SizedBox(width: 8),
                      itemBuilder: (context, index) {
                        final c = classSummary[index];
                        final total = c['total'] as int;
                        final issued = c['issued'] as int;
                        final tone = total > 0 && issued == total
                            ? Tone.good
                            : Tone.neutral;
                        return ToneBadge(
                          '${c['className']} $issued/$total',
                          tone: tone,
                        );
                      },
                    ),
                  ),
                ],
                const SizedBox(height: 16),
                AppFilterBar(
                  labels: ['All', for (final s in apaarStates) stateLabel(s)],
                  selectedIndex: _stateFilter == null
                      ? 0
                      : apaarStates.indexOf(_stateFilter!) + 1,
                  onSelected: (index) => setState(
                    () => _stateFilter = index == 0
                        ? null
                        : apaarStates[index - 1],
                  ),
                ),
                const SizedBox(height: 8),
                if (rows.isEmpty)
                  const EmptyState(
                    icon: Icons.badge_outlined,
                    title: 'No students',
                    message: 'Try a different class or filter.',
                  )
                else
                  ListView.separated(
                    shrinkWrap: true,
                    physics: const NeverScrollableScrollPhysics(),
                    itemCount: rows.length,
                    separatorBuilder: (_, _) => const Divider(
                      height: 1,
                      indent: AppSpacing.page,
                      endIndent: AppSpacing.page,
                    ),
                    itemBuilder: (context, index) {
                      final row = rows[index];
                      final state = row['state'] as String;
                      return AppListRow(
                        leading: AppAvatar(
                          name: row['name'] as String,
                          size: 40,
                          tone: _stateTone(state),
                        ),
                        title: row['name'] as String,
                        subtitle:
                            '${row['admissionNumber']} · ${row['className']} ${row['sectionName']}'
                            '\n${row['nextAction']}',
                        trailing: ToneBadge(
                          stateLabel(state),
                          tone: _stateTone(state),
                        ),
                        showChevron: true,
                        onTap: () async {
                          await Navigator.of(context).push(
                            MaterialPageRoute(
                              builder: (_) => ApaarStudentScreen(student: row),
                            ),
                          );
                          _reload();
                        },
                      );
                    },
                  ),
              ],
            );
          },
        ),
      ),
    );
  }
}

class _CoverageCard extends StatelessWidget {
  const _CoverageCard({required this.coverage, required this.daysToFreeze});

  final Map<String, dynamic> coverage;
  final int daysToFreeze;

  @override
  Widget build(BuildContext context) {
    final total = coverage['total'] as int;
    final issued = coverage['issued'] as int;
    final blocking = coverage['blocking'] as int;
    final coverageBp = coverage['coverageBp'] as int;
    final percent = (coverageBp / 100).toStringAsFixed(
      coverageBp % 100 == 0 ? 0 : 1,
    );

    return AppSurface(
      child: Padding(
        padding: const EdgeInsets.all(AppSpacing.ml),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const SectionHeader('UDISE+ freeze'),
            const SizedBox(height: AppSpacing.sm),
            Row(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                Text(
                  '$percent%',
                  style: Theme.of(context).textTheme.headlineSmall,
                ),
                const SizedBox(width: 8),
                Padding(
                  padding: const EdgeInsets.only(bottom: 4),
                  child: Text(
                    '$issued / $total issued',
                    style: const TextStyle(color: AppColors.ink3),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 10),
            Row(
              children: [
                ToneBadge(
                  daysToFreeze <= 0
                      ? 'Freeze passed'
                      : '$daysToFreeze days to freeze',
                  tone: _freezeTone(daysToFreeze),
                ),
                const SizedBox(width: 8),
                if (blocking > 0)
                  ToneBadge('$blocking blocking certification', tone: Tone.bad),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
