import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/auth/auth_state.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/app_widgets.dart';
import 'consent_record_screen.dart';
import 'consent_vocab.dart';

final _consentProvider = FutureProvider.autoDispose
    .family<Map<String, dynamic>, String?>((ref, purpose) async {
      final api = ref.watch(apiClientProvider);
      return api.get<Map<String, dynamic>>(
        '/consent',
        query: purpose != null ? {'purpose': purpose} : null,
      );
    });

/// Mirrors src/lib/queries/compliance.ts::getConsentRegister via
/// src/app/app/consent/page.tsx: the DPDP consent register — overall
/// coverage, per-purpose totals, and every active student's per-purpose
/// state, with a way to record a new one. OFFICE-only.
class ConsentScreen extends ConsumerStatefulWidget {
  const ConsentScreen({super.key});

  @override
  ConsumerState<ConsentScreen> createState() => _ConsentScreenState();
}

class _ConsentScreenState extends ConsumerState<ConsentScreen> {
  String? _purposeFilter;

  Future<void> _openRecord(
    Map<String, dynamic> row, {
    String? purpose,
    String? state,
  }) async {
    final result = await Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => ConsentRecordScreen(
          studentId: row['id'] as String,
          studentName: row['name'] as String,
          initialPurpose: purpose,
          initialState: state,
        ),
      ),
    );
    if (result != null) ref.invalidate(_consentProvider(_purposeFilter));
  }

  @override
  Widget build(BuildContext context) {
    final register = ref.watch(_consentProvider(_purposeFilter));

    return Scaffold(
      appBar: AppTopBar(title: 'Consent register'),
      body: RefreshIndicator(
        onRefresh: () async => ref.invalidate(_consentProvider(_purposeFilter)),
        child: register.when(
          loading: () => const AppCardsSkeleton(),
          error: (err, _) => ErrorView(
            error: err,
            onRetry: () => ref.invalidate(_consentProvider(_purposeFilter)),
          ),
          data: (data) {
            final purposes = (data['purposes'] as List)
                .cast<Map<String, dynamic>>();
            final rows = (data['rows'] as List).cast<Map<String, dynamic>>();
            final studentCount = data['studentCount'] as int? ?? 0;
            final fullyCovered = data['fullyCovered'] as int? ?? 0;
            final fullyCoveredBp = data['fullyCoveredBp'] as int? ?? 0;
            final coveragePct = fullyCoveredBp / 100;
            final coverageTone = fullyCoveredBp >= 8000
                ? Tone.good
                : (fullyCoveredBp >= 4000 ? Tone.warn : Tone.bad);

            return ListView(
              padding: const EdgeInsets.only(bottom: 24),
              children: [
                Padding(
                  padding: const EdgeInsets.fromLTRB(20, 16, 20, 8),
                  child: AppSurface(
                    color: toneBackground(coverageTone),
                    child: Padding(
                      padding: const EdgeInsets.all(AppSpacing.ml),
                      child: Row(
                        children: [
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                const Eyebrow('Fully covered'),
                                const SizedBox(height: 4),
                                Text(
                                  '$fullyCovered of $studentCount students',
                                  style: const TextStyle(
                                    fontWeight: FontWeight.w600,
                                    fontSize: 15,
                                  ),
                                ),
                              ],
                            ),
                          ),
                          Text(
                            '${coveragePct.toStringAsFixed(0)}%',
                            style: TextStyle(
                              fontSize: 28,
                              fontWeight: FontWeight.w800,
                              color: toneColor(coverageTone),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
                AppFilterBar(
                  labels: [
                    'All purposes',
                    for (final purpose in purposes)
                      '${purpose['short'] ?? purpose['label']} ${purpose['granted']}/${purpose['total']}',
                  ],
                  selectedIndex: _purposeFilter == null
                      ? 0
                      : purposes.indexWhere(
                              (p) => p['value'] == _purposeFilter,
                            ) +
                            1,
                  onSelected: (index) => setState(
                    () => _purposeFilter = index == 0
                        ? null
                        : purposes[index - 1]['value'] as String,
                  ),
                ),
                const SizedBox(height: 8),
                if (rows.isEmpty)
                  const EmptyState(
                    icon: Icons.verified_user_outlined,
                    title: 'No students',
                    message: 'Students appear here once they are enrolled.',
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
                      final records = (row['records'] as List)
                          .cast<Map<String, dynamic>>();
                      final relevant = _purposeFilter == null
                          ? records
                          : records
                                .where((r) => r['purpose'] == _purposeFilter)
                                .toList();

                      return Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          AppListRow(
                            title: row['name'] as String,
                            subtitle:
                                '${row['admissionNumber']} · ${row['className']}',
                            trailing: AppIconButton(
                              icon: Icons.add_circle_rounded,
                              tone: Tone.brand,
                              tooltip: 'Record consent',
                              onPressed: () =>
                                  _openRecord(row, purpose: _purposeFilter),
                            ),
                          ),
                          if (relevant.isNotEmpty)
                            Padding(
                              padding: const EdgeInsets.fromLTRB(
                                AppSpacing.lg,
                                0,
                                AppSpacing.lg,
                                AppSpacing.sm,
                              ),
                              child: Wrap(
                                spacing: 6,
                                runSpacing: 6,
                                children: [
                                  for (final record in relevant)
                                    GestureDetector(
                                      onTap: () => _openRecord(
                                        row,
                                        purpose: record['purpose'] as String,
                                        state: record['state'] as String,
                                      ),
                                      child: ToneBadge(
                                        '${consentPurposeMeta(record['purpose'] as String).short} · ${record['state']}',
                                        tone: toneForConsentState(
                                          record['state'] as String,
                                        ),
                                      ),
                                    ),
                                ],
                              ),
                            ),
                        ],
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
