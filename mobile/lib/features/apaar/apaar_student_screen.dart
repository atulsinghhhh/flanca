import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/auth/auth_state.dart';
import '../../core/network/api_client.dart';
import '../../core/network/api_exception.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/app_widgets.dart';
import 'apaar_screen.dart' show apaarStates, stateLabel;

/// Mirrors src/app/app/apaar/actions.ts::updateApaar: record what the UDISE+
/// portal told us about one student — APAAR ID, PEN, the Aadhaar name it was
/// checked against, and the compliance status — plus the adopt-Aadhaar-name
/// and mark-submitted shortcuts a clerk reaches for from the same row.
///
/// The row passed in comes straight from the list (`GET /apaar` already
/// includes everything this form needs), so opening it costs no extra fetch.
class ApaarStudentScreen extends ConsumerStatefulWidget {
  const ApaarStudentScreen({super.key, required this.student});

  final Map<String, dynamic> student;

  @override
  ConsumerState<ApaarStudentScreen> createState() => _ApaarStudentScreenState();
}

class _ApaarStudentScreenState extends ConsumerState<ApaarStudentScreen> {
  late final TextEditingController _apaarIdController;
  late final TextEditingController _penNumberController;
  late final TextEditingController _aadhaarNameController;
  late final TextEditingController _noteController;
  late String _status;
  bool _busy = false;

  Map<String, dynamic> get _student => widget.student;
  Map<String, dynamic> get _nameCheck => _student['nameCheck'] as Map<String, dynamic>;

  @override
  void initState() {
    super.initState();
    _apaarIdController = TextEditingController(text: _student['apaarId'] as String? ?? '');
    _penNumberController = TextEditingController(text: _student['penNumber'] as String? ?? '');
    _aadhaarNameController = TextEditingController(text: _student['aadhaarName'] as String? ?? '');
    _noteController = TextEditingController(text: _student['apaarNote'] as String? ?? '');
    _status = _student['state'] as String;
  }

  @override
  void dispose() {
    _apaarIdController.dispose();
    _penNumberController.dispose();
    _aadhaarNameController.dispose();
    _noteController.dispose();
    super.dispose();
  }

  Future<void> _run(Future<void> Function(ApiClient api) action, {String? successMessage}) async {
    setState(() => _busy = true);
    try {
      final api = ref.read(apiClientProvider);
      await action(api);
      if (mounted && successMessage != null) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(successMessage)));
      }
    } on ApiException catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _save() => _run(
        (api) => api.patch('/apaar/${_student['id']}', data: {
          'apaarId': _apaarIdController.text.trim(),
          'penNumber': _penNumberController.text.trim(),
          'aadhaarName': _aadhaarNameController.text.trim(),
          'status': _status,
          'note': _noteController.text.trim(),
        }),
        successMessage: 'Saved',
      );

  Future<void> _adoptAadhaarName() => _run(
        (api) async {
          await api.post('/apaar/${_student['id']}/adopt-aadhaar-name');
          setState(() => _aadhaarNameController.text = _student['name'] as String);
        },
        successMessage: 'Aadhaar name adopted from school records',
      );

  Future<void> _markSubmitted() => _run(
        (api) async {
          await api.post('/apaar/mark-submitted', data: {
            'studentIds': [_student['id']],
          });
          setState(() => _status = 'SUBMITTED');
        },
        successMessage: 'Marked submitted',
      );

  @override
  Widget build(BuildContext context) {
    final nameMismatched = _nameCheck['matches'] == false &&
        (_aadhaarNameController.text.trim().isNotEmpty);
    final canMarkSubmitted = _status != 'ISSUED' && _status != 'SUBMITTED';

    return Scaffold(
      appBar: AppTopBar(title: _student['name'] as String),
      body: ListView(
        padding: const EdgeInsets.all(AppSpacing.ml),
        children: [
          Text(
            '${_student['admissionNumber']} · ${_student['className']} ${_student['sectionName']}',
            style: const TextStyle(color: AppColors.ink3),
          ),
          const SizedBox(height: 4),
          Text(_student['nextAction'] as String, style: const TextStyle(fontWeight: FontWeight.w600)),
          const SizedBox(height: 20),
          const SectionHeader('APAAR details'),
          const SizedBox(height: AppSpacing.sm),
          TextField(
            controller: _apaarIdController,
            decoration: const InputDecoration(labelText: 'APAAR ID (12 digits)'),
            keyboardType: TextInputType.number,
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _penNumberController,
            decoration: const InputDecoration(labelText: 'PEN number'),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _aadhaarNameController,
            decoration: const InputDecoration(labelText: 'Aadhaar name'),
            onChanged: (_) => setState(() {}),
          ),
          if (nameMismatched) ...[
            const SizedBox(height: 8),
            AppBanner(
              tone: Tone.bad,
              icon: Icons.error_outline_rounded,
              message: _nameCheck['reason'] as String? ?? 'Name does not match the school record.',
              action: OutlinedButton.icon(
                onPressed: _busy ? null : _adoptAadhaarName,
                icon: const Icon(Icons.sync_alt, size: 18),
                label: Text('Adopt "${_student['name']}" as Aadhaar name'),
              ),
            ),
          ],
          const SizedBox(height: 12),
          DropdownButtonFormField<String>(
            initialValue: apaarStates.contains(_status) ? _status : apaarStates.first,
            decoration: const InputDecoration(labelText: 'Status'),
            items: apaarStates
                .map((s) => DropdownMenuItem(value: s, child: Text(stateLabel(s))))
                .toList(),
            onChanged: (value) => setState(() => _status = value!),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _noteController,
            decoration: const InputDecoration(labelText: 'Note'),
            maxLines: 3,
          ),
          const SizedBox(height: 20),
          if (canMarkSubmitted) ...[
            OutlinedButton(
              onPressed: _busy ? null : _markSubmitted,
              child: const Text('Mark as submitted to UDISE+'),
            ),
            const SizedBox(height: 12),
          ],
          AppSubmitButton(label: 'Save', busy: _busy, onPressed: _save),
        ],
      ),
    );
  }
}
