import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/auth/auth_state.dart';
import '../../core/network/api_exception.dart';
import 'certificate_vocab.dart';
import '../../core/widgets/app_widgets.dart';
import '../../core/theme/app_theme.dart';

/// Mirrors src/app/app/certificates/actions.ts::issueCertificate's input —
/// studentId + type is all the mobile API strictly requires (it validates
/// loosely; certificateMeta on the server fills in what each type needs), so
/// every optional field is shown flat rather than switched per type for v1.
class CertificateIssueScreen extends ConsumerStatefulWidget {
  const CertificateIssueScreen({super.key});

  @override
  ConsumerState<CertificateIssueScreen> createState() => _CertificateIssueScreenState();
}

class _CertificateIssueScreenState extends ConsumerState<CertificateIssueScreen> {
  final _formKey = GlobalKey<FormState>();
  final _studentIdController = TextEditingController();
  final _issuedOnController = TextEditingController();
  final _purposeController = TextEditingController();
  final _remarksController = TextEditingController();

  String _type = kCertificateTypes.first.value;
  String? _conduct;
  String? _leavingReason;
  bool _markTransferred = false;
  bool _saving = false;

  @override
  void dispose() {
    _studentIdController.dispose();
    _issuedOnController.dispose();
    _purposeController.dispose();
    _remarksController.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!(_formKey.currentState?.validate() ?? false)) return;

    setState(() => _saving = true);
    try {
      final api = ref.read(apiClientProvider);
      final data = await api.post<Map<String, dynamic>>('/certificates', data: {
        'studentId': _studentIdController.text.trim(),
        'type': _type,
        if (_issuedOnController.text.trim().isNotEmpty) 'issuedOn': _issuedOnController.text.trim(),
        if (_purposeController.text.trim().isNotEmpty) 'purpose': _purposeController.text.trim(),
        if (_conduct != null) 'conduct': _conduct,
        if (_leavingReason != null) 'leavingReason': _leavingReason,
        if (_remarksController.text.trim().isNotEmpty) 'remarks': _remarksController.text.trim(),
        'markTransferred': _markTransferred,
      });
      if (mounted) {
        Navigator.of(context).pop(data);
      }
    } on ApiException catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppTopBar(title: 'Issue certificate'),
      body: Form(
        key: _formKey,
        child: ListView(
          padding: const EdgeInsets.all(AppSpacing.ml),
          children: [
            AppFormSection(
              title: 'Student',
              children: [
                TextFormField(
                  controller: _studentIdController,
                  decoration: const InputDecoration(labelText: 'Student ID'),
                  validator: (v) => (v == null || v.trim().isEmpty) ? 'Required' : null,
                ),
                DropdownButtonFormField<String>(
                  initialValue: _type,
                  decoration: const InputDecoration(labelText: 'Certificate type'),
                  items: kCertificateTypes
                      .map((t) => DropdownMenuItem(value: t.value, child: Text(t.label)))
                      .toList(),
                  onChanged: (v) => setState(() => _type = v ?? _type),
                ),
              ],
            ),
            const SizedBox(height: AppSpacing.lg),
            AppFormSection(
              title: 'Details',
              children: [
                TextFormField(
                  controller: _issuedOnController,
                  decoration: const InputDecoration(
                    labelText: 'Issue date (YYYY-MM-DD, optional — defaults to today)',
                  ),
                ),
                TextFormField(
                  controller: _purposeController,
                  decoration: const InputDecoration(labelText: 'Purpose (optional)'),
                ),
                DropdownButtonFormField<String>(
                  initialValue: _conduct,
                  decoration: const InputDecoration(labelText: 'Conduct (optional)'),
                  items: kConductOptions.map((c) => DropdownMenuItem(value: c, child: Text(c))).toList(),
                  onChanged: (v) => setState(() => _conduct = v),
                  isExpanded: true,
                ),
                DropdownButtonFormField<String>(
                  initialValue: _leavingReason,
                  decoration: const InputDecoration(labelText: 'Leaving reason (optional, TC)'),
                  items: kLeavingReasons.map((r) => DropdownMenuItem(value: r, child: Text(r))).toList(),
                  onChanged: (v) => setState(() => _leavingReason = v),
                  isExpanded: true,
                ),
                TextFormField(
                  controller: _remarksController,
                  decoration: const InputDecoration(labelText: 'Remarks (optional)'),
                  maxLines: 2,
                ),
              ],
            ),
            const SizedBox(height: AppSpacing.lg),
            // A single toggleable row rather than a bare CheckboxListTile —
            // same AppTileGroup/Checkbox-in-trailing shape staff_detail_screen
            // uses for its "Active" switch, so a boolean flag reads the same
            // way wherever a form asks for one.
            AppTileGroup(
              tiles: [
                AppTileSpec(
                  Icons.person_remove_outlined,
                  'Mark student as transferred out',
                  () => setState(() => _markTransferred = !_markTransferred),
                  tone: Tone.warn,
                  trailing: Checkbox(
                    value: _markTransferred,
                    onChanged: (v) => setState(() => _markTransferred = v ?? false),
                  ),
                ),
              ],
            ),
            const SizedBox(height: AppSpacing.xl),
            AppSubmitButton(
              label: 'Issue certificate',
              busy: _saving,
              onPressed: _submit,
            ),
          ],
        ),
      ),
    );
  }
}
