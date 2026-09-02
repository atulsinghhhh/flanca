import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/auth/auth_state.dart';
import '../../core/format.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/app_widgets.dart';
import 'certificate_detail_screen.dart';
import 'certificate_issue_screen.dart';
import 'certificate_vocab.dart';

final _certificatesProvider = FutureProvider.autoDispose
    .family<Map<String, dynamic>, String?>((ref, type) async {
      final api = ref.watch(apiClientProvider);
      return api.get<Map<String, dynamic>>(
        '/certificates',
        query: type != null ? {'type': type} : null,
      );
    });

/// Mirrors src/app/app/certificates/page.tsx: every certificate issued by
/// this school (optionally filtered by type), with counts, and a way to
/// issue a new one. OFFICE-only, wired centrally from More.
class CertificatesScreen extends ConsumerStatefulWidget {
  const CertificatesScreen({super.key});

  @override
  ConsumerState<CertificatesScreen> createState() => _CertificatesScreenState();
}

class _CertificatesScreenState extends ConsumerState<CertificatesScreen> {
  String? _typeFilter;

  @override
  Widget build(BuildContext context) {
    final certificates = ref.watch(_certificatesProvider(_typeFilter));

    return Scaffold(
      appBar: AppTopBar(title: 'Certificates'),
      floatingActionButton: AppFab(
        icon: Icons.add_rounded,
        label: 'Issue',
        onPressed: () async {
          final result = await Navigator.of(context).push(
            MaterialPageRoute(builder: (_) => const CertificateIssueScreen()),
          );
          if (result != null) {
            ref.invalidate(_certificatesProvider(_typeFilter));
          }
        },
      ),
      body: RefreshIndicator(
        onRefresh: () async =>
            ref.invalidate(_certificatesProvider(_typeFilter)),
        child: certificates.when(
          loading: () => const AppListSkeleton(),
          error: (err, _) => ErrorView(
            error: err,
            onRetry: () => ref.invalidate(_certificatesProvider(_typeFilter)),
          ),
          data: (data) {
            final rows = (data['certificates'] as List)
                .cast<Map<String, dynamic>>();
            final total = data['total'] as int? ?? 0;
            final cancelledCount = data['cancelledCount'] as int? ?? 0;

            return ListView(
              padding: const EdgeInsets.only(bottom: 96),
              children: [
                Padding(
                  padding: const EdgeInsets.fromLTRB(20, 16, 20, 4),
                  child: Text(
                    '$total issued · $cancelledCount cancelled',
                    style: const TextStyle(color: AppColors.ink3, fontSize: 13),
                  ),
                ),
                AppFilterBar(
                  labels: ['All', for (final t in kCertificateTypes) t.short],
                  selectedIndex: _typeFilter == null
                      ? 0
                      : kCertificateTypes.indexWhere(
                              (t) => t.value == _typeFilter,
                            ) +
                            1,
                  onSelected: (index) => setState(
                    () => _typeFilter = index == 0
                        ? null
                        : kCertificateTypes[index - 1].value,
                  ),
                ),
                const SizedBox(height: 8),
                if (rows.isEmpty)
                  const EmptyState(
                    icon: Icons.description_outlined,
                    title: 'No certificates',
                    message: 'Issued certificates will be listed here.',
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
                      final c = rows[index];
                      final student = c['student'] as Map<String, dynamic>?;
                      final className =
                          (student?['class'] as Map?)?['name'] as String?;
                      final isCancelled = c['cancelledAt'] != null;
                      final meta = certificateMeta(c['type'] as String);

                      return AppListRow(
                        icon: Icons.workspace_premium_outlined,
                        tone: isCancelled ? Tone.neutral : Tone.brand,
                        title: c['serialNo'] as String,
                        titleWidget: Row(
                          children: [
                            ToneBadge(
                              meta.short,
                              tone: isCancelled ? Tone.neutral : Tone.brand,
                              dot: false,
                            ),
                            const SizedBox(width: AppSpacing.sm),
                            Expanded(
                              child: Text(
                                c['serialNo'] as String,
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: const TextStyle(
                                  fontWeight: FontWeight.w700,
                                  fontSize: 14.5,
                                  letterSpacing: -0.2,
                                ),
                              ),
                            ),
                          ],
                        ),
                        subtitle:
                            '${student?['name'] ?? '—'}'
                            '${className != null ? ' · $className' : ''}'
                            ' · ${formatDay(c['issuedOn'] as String)}',
                        trailing: isCancelled
                            ? const ToneBadge('Cancelled', tone: Tone.bad)
                            : null,
                        showChevron: !isCancelled,
                        onTap: () => Navigator.of(context).push(
                          MaterialPageRoute(
                            builder: (_) => CertificateDetailScreen(
                              certificateId: c['id'] as String,
                            ),
                          ),
                        ),
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
