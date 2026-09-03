import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/auth/auth_state.dart';
import '../../core/format.dart';
import '../../core/network/api_exception.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/app_widgets.dart';
import 'certificate_vocab.dart';

final _certificateDetailProvider = FutureProvider.family<Map<String, dynamic>, String>(
  (ref, id) async {
    final api = ref.watch(apiClientProvider);
    return api.get<Map<String, dynamic>>('/certificates/$id');
  },
);

/// Mirrors src/app/app/certificates/[id]/page.tsx: the issued certificate,
/// the school header it was printed with, its public verify URL, and — if
/// still active — a cancel action (the serial is never reused).
class CertificateDetailScreen extends ConsumerStatefulWidget {
  const CertificateDetailScreen({super.key, required this.certificateId});

  final String certificateId;

  @override
  ConsumerState<CertificateDetailScreen> createState() => _CertificateDetailScreenState();
}

class _CertificateDetailScreenState extends ConsumerState<CertificateDetailScreen> {
  bool _cancelling = false;

  Future<void> _cancel() async {
    final reasonController = TextEditingController();
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Cancel certificate'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('The serial number is never reused. This cannot be undone.'),
            const SizedBox(height: 12),
            TextField(
              controller: reasonController,
              autofocus: true,
              decoration: const InputDecoration(labelText: 'Reason'),
              maxLines: 2,
            ),
          ],
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Back')),
          FilledButton(onPressed: () => Navigator.pop(context, true), child: const Text('Cancel certificate')),
        ],
      ),
    );
    if (confirmed != true) return;
    final reason = reasonController.text.trim();
    if (reason.isEmpty) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('A reason is required.')));
      return;
    }

    setState(() => _cancelling = true);
    try {
      final api = ref.read(apiClientProvider);
      await api.post('/certificates/${widget.certificateId}/cancel', data: {'reason': reason});
      ref.invalidate(_certificateDetailProvider(widget.certificateId));
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Certificate cancelled')));
      }
    } on ApiException catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
    } finally {
      if (mounted) setState(() => _cancelling = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final detail = ref.watch(_certificateDetailProvider(widget.certificateId));

    return Scaffold(
      appBar: AppTopBar(title: 'Certificate'),
      body: detail.when(
        loading: () => const AppDetailSkeleton(),
        error: (err, _) =>
            ErrorView(error: err, onRetry: () => ref.invalidate(_certificateDetailProvider(widget.certificateId))),
        data: (data) {
          final certificate = data['certificate'] as Map<String, dynamic>;
          final school = data['school'] as Map<String, dynamic>;
          final student = certificate['student'] as Map<String, dynamic>?;
          final snapshot = (certificate['snapshot'] as Map?)?.cast<String, dynamic>() ?? const {};
          final type = certificate['type'] as String;
          final meta = certificateMeta(type);
          final isCancelled = certificate['cancelledAt'] != null;

          return ListView(
            padding: const EdgeInsets.all(20),
            children: [
              Row(
                children: [
                  ToneBadge(meta.short, tone: Tone.brand),
                  const SizedBox(width: 8),
                  if (isCancelled) const ToneBadge('Cancelled', tone: Tone.bad),
                ],
              ),
              const SizedBox(height: 12),
              Text(
                certificate['serialNo'] as String,
                style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w700),
              ),
              const SizedBox(height: 4),
              Text(
                student?['name'] as String? ?? '—',
                style: const TextStyle(fontSize: 16, color: AppColors.ink2),
              ),
              const SizedBox(height: 20),
              const SectionHeader('Details'),
              const SizedBox(height: AppSpacing.sm),
              AppKeyValueGroup(
                rows: [
                  AppKeyValue(label: 'Issued on', value: formatDay(certificate['issuedOn'] as String)),
                  if (snapshot['purpose'] != null) AppKeyValue(label: 'Purpose', value: snapshot['purpose'] as String),
                  if (snapshot['conduct'] != null) AppKeyValue(label: 'Conduct', value: snapshot['conduct'] as String),
                  if (snapshot['leavingReason'] != null)
                    AppKeyValue(label: 'Leaving reason', value: snapshot['leavingReason'] as String),
                  if (snapshot['remarks'] != null) AppKeyValue(label: 'Remarks', value: snapshot['remarks'] as String),
                  if (snapshot['feeWarning'] != null)
                    AppKeyValue(label: 'Fee status', value: snapshot['feeWarning'] as String, tone: Tone.warn),
                ],
              ),
              const SizedBox(height: 20),
              const SectionHeader('School'),
              const SizedBox(height: AppSpacing.sm),
              AppKeyValueGroup(
                rows: [
                  AppKeyValue(label: 'School', value: school['name'] as String? ?? '—'),
                  AppKeyValue(label: 'Verify URL', value: data['verifyUrl'] as String? ?? '—'),
                ],
              ),
              if (!isCancelled) ...[
                const SizedBox(height: 24),
                OutlinedButton(
                  onPressed: _cancelling ? null : _cancel,
                  style: OutlinedButton.styleFrom(foregroundColor: AppColors.overdue, side: const BorderSide(color: AppColors.overdue)),
                  child: _cancelling
                      ? const SizedBox(height: 18, width: 18, child: CircularProgressIndicator(strokeWidth: 2))
                      : const Text('Cancel this certificate'),
                ),
              ],
            ],
          );
        },
      ),
    );
  }
}
