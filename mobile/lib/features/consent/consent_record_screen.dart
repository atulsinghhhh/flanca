import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/auth/auth_state.dart';
import '../../core/network/api_exception.dart';
import 'consent_vocab.dart';
import '../../core/widgets/app_widgets.dart';
import '../../core/theme/app_theme.dart';

/// Mirrors src/app/app/consent/actions.ts::recordConsent — one student, one
/// purpose, a new state, and (when granting) how the parent was verified.
/// The Act requires this to be recorded, not assumed, so every grant needs a
/// method and the office worker's name doing the recording.
class ConsentRecordScreen extends ConsumerStatefulWidget {
  const ConsentRecordScreen({
    super.key,
    required this.studentId,
    required this.studentName,
    this.initialPurpose,
    this.initialState,
  });

  final String studentId;
  final String studentName;
  final String? initialPurpose;
  final String? initialState;

  @override
  ConsumerState<ConsentRecordScreen> createState() => _ConsentRecordScreenState();
}

class _ConsentRecordScreenState extends ConsumerState<ConsentRecordScreen> {
  final _grantedByController = TextEditingController();
  final _verifiedRefController = TextEditingController();

  late String _purpose = widget.initialPurpose ?? kConsentPurposes.first.value;
  late String _state = widget.initialState ?? 'GRANTED';
  String? _verifiedVia;
  bool _saving = false;

  @override
  void dispose() {
    _grantedByController.dispose();
    _verifiedRefController.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (_state == 'GRANTED' && _verifiedVia == null) {
      ScaffoldMessenger.of(context)
          .showSnackBar(const SnackBar(content: Text('Choose how the parent was verified.')));
      return;
    }

    setState(() => _saving = true);
    try {
      final api = ref.read(apiClientProvider);
      final data = await api.post<Map<String, dynamic>>('/consent', data: {
        'studentId': widget.studentId,
        'purpose': _purpose,
        'state': _state,
        if (_verifiedVia != null) 'verifiedVia': _verifiedVia,
        if (_grantedByController.text.trim().isNotEmpty) 'grantedByName': _grantedByController.text.trim(),
        if (_verifiedRefController.text.trim().isNotEmpty) 'verifiedRef': _verifiedRefController.text.trim(),
      });
      if (mounted) Navigator.of(context).pop(data);
    } on ApiException catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppTopBar(title: 'Record consent', subtitle: widget.studentName),
      body: ListView(
        padding: const EdgeInsets.all(AppSpacing.ml),
        children: [
          AppFormSection(
            title: 'Consent',
            children: [
              DropdownButtonFormField<String>(
                initialValue: _purpose,
                decoration: const InputDecoration(labelText: 'Purpose'),
                items: kConsentPurposes.map((p) => DropdownMenuItem(value: p.value, child: Text(p.label))).toList(),
                onChanged: (v) => setState(() => _purpose = v ?? _purpose),
              ),
              DropdownButtonFormField<String>(
                initialValue: _state,
                decoration: const InputDecoration(labelText: 'State'),
                items: kConsentStates.map((s) => DropdownMenuItem(value: s, child: Text(s))).toList(),
                onChanged: (v) => setState(() => _state = v ?? _state),
              ),
              DropdownButtonFormField<String>(
                initialValue: _verifiedVia,
                decoration: InputDecoration(
                  labelText: _state == 'GRANTED' ? 'Verified via (required)' : 'Verified via (optional)',
                ),
                items: kVerificationMethods.map((m) => DropdownMenuItem(value: m.value, child: Text(m.label))).toList(),
                onChanged: (v) => setState(() => _verifiedVia = v),
                isExpanded: true,
              ),
            ],
          ),
          const SizedBox(height: AppSpacing.lg),
          AppFormSection(
            title: 'Recorded by',
            children: [
              TextFormField(
                controller: _grantedByController,
                decoration: const InputDecoration(labelText: 'Granted by (parent name, optional)'),
              ),
              TextFormField(
                controller: _verifiedRefController,
                decoration: const InputDecoration(labelText: 'Verification reference (optional)'),
              ),
            ],
          ),
          const SizedBox(height: AppSpacing.xl),
          AppSubmitButton(
            label: 'Save',
            busy: _saving,
            onPressed: _submit,
          ),
        ],
      ),
    );
  }
}
