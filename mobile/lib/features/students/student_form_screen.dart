import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../core/auth/auth_state.dart';
import '../../core/network/api_exception.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/app_widgets.dart';
import '../../models/student.dart';
import 'students_list_screen.dart' show classOptionsProvider;

const _categories = ['GEN', 'OBC', 'SC', 'ST', 'EWS'];
const _bloodGroups = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
final _isoFormat = DateFormat('yyyy-MM-dd');

/// One form for admitting a child and for correcting one afterwards, exactly
/// like src/app/app/students/student-form.tsx: deliberately the same
/// component for both, so create and edit never drift into two sets of
/// rules. `existing == null` admits; otherwise it corrects that record.
///
/// The admission number is editable only at admission — src/lib/core/
/// student-core.ts and src/app/app/students/actions.ts::updateStudent both
/// treat it as immutable once issued (it is printed on receipts and
/// certificates), so the edit form shows it read-only.
class StudentFormScreen extends ConsumerStatefulWidget {
  const StudentFormScreen({super.key, this.existing});

  final Student? existing;

  @override
  ConsumerState<StudentFormScreen> createState() => _StudentFormScreenState();
}

class _StudentFormScreenState extends ConsumerState<StudentFormScreen> {
  final _formKey = GlobalKey<FormState>();

  late final _name = TextEditingController(text: widget.existing?.name ?? '');
  late final _admissionNumber = TextEditingController();
  late final _rollNumber = TextEditingController(text: widget.existing?.rollNumber?.toString() ?? '');
  late final _fatherName = TextEditingController(text: widget.existing?.fatherName ?? '');
  late final _motherName = TextEditingController(text: widget.existing?.motherName ?? '');
  late final _guardianPhone = TextEditingController(text: widget.existing?.guardianPhone ?? '');
  late final _guardianEmail = TextEditingController(text: widget.existing?.guardianEmail ?? '');
  late final _address = TextEditingController(text: widget.existing?.address ?? '');

  String? _classId;
  String? _sectionId;
  String? _gender;
  String? _category;
  String? _bloodGroup;
  String? _dobIso;
  late String? _admissionDateIso = widget.existing?.admissionDateIso ?? _isoFormat.format(DateTime.now());

  bool _saving = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _classId = widget.existing?.classId;
    _sectionId = widget.existing?.sectionId;
    _gender = widget.existing?.gender;
    _category = widget.existing?.category;
    _bloodGroup = widget.existing?.bloodGroup;
    _dobIso = widget.existing?.dobIso;
  }

  @override
  void dispose() {
    _name.dispose();
    _admissionNumber.dispose();
    _rollNumber.dispose();
    _fatherName.dispose();
    _motherName.dispose();
    _guardianPhone.dispose();
    _guardianEmail.dispose();
    _address.dispose();
    super.dispose();
  }

  Future<void> _pickDate({required String? initialIso, required ValueChanged<String> onPicked}) async {
    final initial = initialIso != null ? DateTime.tryParse(initialIso) ?? DateTime.now() : DateTime.now();
    final picked = await showDatePicker(
      context: context,
      initialDate: initial,
      firstDate: DateTime(1990),
      lastDate: DateTime.now(),
    );
    if (picked != null) onPicked(_isoFormat.format(picked));
  }

  Future<void> _submit(List<Map<String, dynamic>> classes) async {
    if (!_formKey.currentState!.validate()) return;
    if (_classId == null) {
      setState(() => _error = 'Choose the class the child is joining.');
      return;
    }

    setState(() {
      _saving = true;
      _error = null;
    });

    final body = <String, dynamic>{
      'name': _name.text.trim(),
      'classId': _classId,
      'sectionId': _sectionId,
      'rollNumber': _rollNumber.text.trim().isEmpty ? null : int.tryParse(_rollNumber.text.trim()),
      'dobIso': _dobIso,
      'gender': _gender,
      'fatherName': _fatherName.text.trim().isEmpty ? null : _fatherName.text.trim(),
      'motherName': _motherName.text.trim().isEmpty ? null : _motherName.text.trim(),
      'guardianPhone': _guardianPhone.text.trim().isEmpty ? null : _guardianPhone.text.trim(),
      'guardianEmail': _guardianEmail.text.trim().isEmpty ? null : _guardianEmail.text.trim(),
      'address': _address.text.trim().isEmpty ? null : _address.text.trim(),
      'category': _category,
      'bloodGroup': _bloodGroup,
      'admissionDateIso': _admissionDateIso,
    };
    if (widget.existing == null && _admissionNumber.text.trim().isNotEmpty) {
      body['admissionNumber'] = _admissionNumber.text.trim();
    }

    try {
      final api = ref.read(apiClientProvider);
      if (widget.existing == null) {
        await api.post<Map<String, dynamic>>('/students', data: body);
      } else {
        await api.patch<Map<String, dynamic>>('/students/${widget.existing!.id}', data: body);
      }
      if (mounted) Navigator.of(context).pop(true);
    } on ApiException catch (e) {
      setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final classesAsync = ref.watch(classOptionsProvider);
    final editing = widget.existing != null;

    return Scaffold(
      appBar: AppTopBar(title: editing ? 'Correct this record' : 'New student'),
      body: classesAsync.when(
        loading: () => const AppCardsSkeleton(),
        error: (err, _) => ErrorView(error: err, onRetry: () => ref.invalidate(classOptionsProvider)),
        data: (classes) {
          final sections = (classes.firstWhere(
                (c) => c['id'] == _classId,
                orElse: () => const {'sections': []},
              )['sections'] as List)
              .cast<Map<String, dynamic>>();
          if (_sectionId != null && sections.every((s) => s['id'] != _sectionId)) {
            _sectionId = null;
          }

          return Form(
            key: _formKey,
            child: ListView(
              padding: const EdgeInsets.fromLTRB(AppSpacing.page, AppSpacing.lg, AppSpacing.page, AppSpacing.xxl),
              children: [
                if (_error != null) ...[
                  AppErrorBanner(_error!),
                  const SizedBox(height: AppSpacing.lg),
                ],
                if (editing) ...[
                  AppBanner(
                    tone: Tone.neutral,
                    icon: Icons.lock_outline_rounded,
                    message: 'Admission number ${widget.existing!.admissionNumber} cannot be changed — it is '
                        'printed on receipts and certificates already issued.',
                  ),
                  const SizedBox(height: AppSpacing.lg),
                ],
                AppFormSection(
                  title: 'The child',
                  children: [
                    TextFormField(
                      controller: _name,
                      decoration: const InputDecoration(labelText: 'Full name *'),
                      validator: (v) => (v == null || v.trim().isEmpty) ? 'Required' : null,
                    ),
                    if (!editing)
                      TextFormField(
                        controller: _admissionNumber,
                        decoration:
                            const InputDecoration(labelText: 'Admission number', hintText: 'Issued automatically'),
                      ),
                    AppDateField(
                      label: 'Date of birth',
                      isoValue: _dobIso,
                      onTap: () => _pickDate(initialIso: _dobIso, onPicked: (v) => setState(() => _dobIso = v)),
                    ),
                    DropdownButtonFormField<String?>(
                      initialValue: _gender,
                      decoration: const InputDecoration(labelText: 'Gender'),
                      items: const [
                        DropdownMenuItem(value: null, child: Text('Not recorded')),
                        DropdownMenuItem(value: 'MALE', child: Text('Boy')),
                        DropdownMenuItem(value: 'FEMALE', child: Text('Girl')),
                        DropdownMenuItem(value: 'OTHER', child: Text('Other')),
                      ],
                      onChanged: (v) => setState(() => _gender = v),
                    ),
                    DropdownButtonFormField<String?>(
                      initialValue: _bloodGroup,
                      decoration: const InputDecoration(labelText: 'Blood group'),
                      items: [
                        const DropdownMenuItem(value: null, child: Text('Not recorded')),
                        for (final b in _bloodGroups) DropdownMenuItem(value: b, child: Text(b)),
                      ],
                      onChanged: (v) => setState(() => _bloodGroup = v),
                    ),
                    DropdownButtonFormField<String?>(
                      initialValue: _category,
                      decoration: const InputDecoration(labelText: 'Category (UDISE+)'),
                      items: [
                        const DropdownMenuItem(value: null, child: Text('Not recorded')),
                        for (final c in _categories) DropdownMenuItem(value: c, child: Text(c)),
                      ],
                      onChanged: (v) => setState(() => _category = v),
                    ),
                  ],
                ),
                const SizedBox(height: AppSpacing.lg),
                AppFormSection(
                  title: 'Where the child sits',
                  children: [
                    DropdownButtonFormField<String?>(
                      initialValue: _classId,
                      decoration: const InputDecoration(labelText: 'Class *'),
                      items: [
                        const DropdownMenuItem(value: null, child: Text('Choose a class…')),
                        for (final c in classes)
                          DropdownMenuItem(value: c['id'] as String, child: Text(c['name'] as String)),
                      ],
                      onChanged: (v) => setState(() {
                        _classId = v;
                        _sectionId = null;
                      }),
                    ),
                    DropdownButtonFormField<String?>(
                      initialValue: _sectionId,
                      decoration:
                          InputDecoration(labelText: sections.isEmpty ? 'Section (choose a class first)' : 'Section'),
                      items: [
                        const DropdownMenuItem(value: null, child: Text('Not assigned yet')),
                        for (final s in sections)
                          DropdownMenuItem(value: s['id'] as String, child: Text(s['name'] as String)),
                      ],
                      onChanged: sections.isEmpty ? null : (v) => setState(() => _sectionId = v),
                    ),
                    TextFormField(
                      controller: _rollNumber,
                      keyboardType: TextInputType.number,
                      decoration: const InputDecoration(labelText: 'Roll number'),
                    ),
                    AppDateField(
                      label: 'Date of admission',
                      isoValue: _admissionDateIso,
                      onTap: () => _pickDate(
                        initialIso: _admissionDateIso,
                        onPicked: (v) => setState(() => _admissionDateIso = v),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: AppSpacing.lg),
                AppFormSection(
                  title: 'Parents',
                  children: [
                    TextFormField(
                      controller: _fatherName,
                      decoration: const InputDecoration(labelText: "Father's name"),
                    ),
                    TextFormField(
                      controller: _motherName,
                      decoration: const InputDecoration(labelText: "Mother's name"),
                    ),
                    TextFormField(
                      controller: _guardianPhone,
                      keyboardType: TextInputType.phone,
                      decoration: const InputDecoration(labelText: 'Mobile', hintText: '10 digits'),
                    ),
                    TextFormField(
                      controller: _guardianEmail,
                      keyboardType: TextInputType.emailAddress,
                      decoration: const InputDecoration(labelText: 'Email'),
                    ),
                    TextFormField(
                      controller: _address,
                      decoration: const InputDecoration(labelText: 'Address'),
                      maxLines: 2,
                    ),
                  ],
                ),
                const SizedBox(height: AppSpacing.xl),
                AppSubmitButton(
                  label: editing ? 'Save the correction' : 'Admit this student',
                  busy: _saving,
                  onPressed: () => _submit(classes),
                ),
              ],
            ),
          );
        },
      ),
    );
  }
}
