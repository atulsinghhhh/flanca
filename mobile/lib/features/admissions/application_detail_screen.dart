import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/auth/auth_state.dart';
import '../../core/format.dart';
import '../../core/network/api_exception.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/app_widgets.dart';
import 'admissions_screen.dart' show applicationStatuses, applicationStatusLabel, applicationStatusTone;

final _applicationDetailProvider = FutureProvider.family<Map<String, dynamic>, String>(
  (ref, id) async {
    final api = ref.watch(apiClientProvider);
    final data = await api.get<Map<String, dynamic>>('/admissions/applications/$id');
    return data['application'] as Map<String, dynamic>;
  },
);

/// `GET /settings/classes` already backs the web settings screen; reused here
/// so the enrol step picks a real class instead of typing a raw id.
final _classesProvider = FutureProvider<List<Map<String, dynamic>>>((ref) async {
  final api = ref.watch(apiClientProvider);
  final data = await api.get<Map<String, dynamic>>('/settings/classes');
  return (data['classes'] as List).cast<Map<String, dynamic>>();
});

/// Mirrors src/app/app/admissions/[id]/ (application detail + review):
/// applicant details, a status/notes update form, and — once accepted — the
/// "Enrol" action that turns the application into an actual Student record.
class ApplicationDetailScreen extends ConsumerStatefulWidget {
  const ApplicationDetailScreen({super.key, required this.applicationId});

  final String applicationId;

  @override
  ConsumerState<ApplicationDetailScreen> createState() => _ApplicationDetailScreenState();
}

class _ApplicationDetailScreenState extends ConsumerState<ApplicationDetailScreen> {
  final _documentsNoteController = TextEditingController();
  final _reviewNoteController = TextEditingController();
  String? _status;
  String? _selectedClassId;
  bool _busy = false;
  bool _initialised = false;

  @override
  void dispose() {
    _documentsNoteController.dispose();
    _reviewNoteController.dispose();
    super.dispose();
  }

  void _reload() => ref.invalidate(_applicationDetailProvider(widget.applicationId));

  Future<void> _save() async {
    setState(() => _busy = true);
    try {
      final api = ref.read(apiClientProvider);
      await api.patch('/admissions/applications/${widget.applicationId}', data: {
        'status': _status,
        'documentsNote': _documentsNoteController.text.trim(),
        'reviewNote': _reviewNoteController.text.trim(),
      });
      _reload();
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Application updated')));
    } on ApiException catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _enrol() async {
    if (_selectedClassId == null) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Choose a class first')));
      return;
    }
    setState(() => _busy = true);
    try {
      final api = ref.read(apiClientProvider);
      final result = await api.post<Map<String, dynamic>>(
        '/admissions/applications/${widget.applicationId}/enrol',
        data: {'classId': _selectedClassId},
      );
      _reload();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Enrolled as ${result['admissionNumber']}')),
        );
      }
    } on ApiException catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final detail = ref.watch(_applicationDetailProvider(widget.applicationId));

    return Scaffold(
      appBar: AppTopBar(title: 'Application'),
      body: detail.when(
        loading: () => const AppDetailSkeleton(),
        error: (err, _) => ErrorView(error: err, onRetry: _reload),
        data: (application) {
          if (!_initialised) {
            _status = application['status'] as String;
            _documentsNoteController.text = application['documentsNote'] as String? ?? '';
            _reviewNoteController.text = application['reviewNote'] as String? ?? '';
            _initialised = true;
          }
          final enrolledStudentId = application['enrolledStudentId'] as String?;

          final status = application['status'] as String;

          return ListView(
            padding: const EdgeInsets.fromLTRB(AppSpacing.page, AppSpacing.lg, AppSpacing.page, AppSpacing.xxl),
            children: [
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  AppAvatar(name: application['studentName'] as String, size: 52, tone: applicationStatusTone(status)),
                  const SizedBox(width: AppSpacing.md),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Text(
                          application['studentName'] as String,
                          style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 19, letterSpacing: -0.4),
                        ),
                        const SizedBox(height: 2),
                        Text(
                          '${application['applicationNo']} · ${application['classSought']}',
                          style: const TextStyle(color: AppColors.ink3, fontWeight: FontWeight.w500),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(width: AppSpacing.sm),
                  ToneBadge(applicationStatusLabel(status), tone: applicationStatusTone(status)),
                ],
              ),
              const SizedBox(height: AppSpacing.xl),
              const SectionHeader('Applicant'),
              const SizedBox(height: AppSpacing.sm),
              AppKeyValueGroup(rows: [
                AppKeyValue(
                  label: 'Date of birth',
                  value: application['dob'] != null ? formatDay(application['dob'] as String) : '—',
                ),
                AppKeyValue(label: 'Gender', value: application['gender'] as String? ?? '—'),
                AppKeyValue(label: 'Parent', value: application['parentName'] as String? ?? '—'),
                AppKeyValue(label: 'Phone', value: application['phone'] as String? ?? '—'),
                if ((application['email'] as String?)?.isNotEmpty ?? false)
                  AppKeyValue(label: 'Email', value: application['email'] as String),
                AppKeyValue(label: 'Address', value: application['address'] as String? ?? '—'),
                if ((application['previousSchool'] as String?)?.isNotEmpty ?? false)
                  AppKeyValue(label: 'Previous school', value: application['previousSchool'] as String),
                if (application['submittedAt'] != null)
                  AppKeyValue(label: 'Submitted', value: formatDay(application['submittedAt'] as String)),
              ]),
              const SizedBox(height: AppSpacing.lg),
              AppFormSection(
                title: 'Review',
                children: [
                  DropdownButtonFormField<String>(
                    initialValue: _status,
                    decoration: const InputDecoration(labelText: 'Status'),
                    items: applicationStatuses
                        .map((s) => DropdownMenuItem(value: s, child: Text(applicationStatusLabel(s))))
                        .toList(),
                    onChanged: (v) => setState(() => _status = v),
                  ),
                  TextField(
                    controller: _documentsNoteController,
                    decoration: const InputDecoration(labelText: 'Documents note'),
                    maxLines: 2,
                  ),
                  TextField(
                    controller: _reviewNoteController,
                    decoration: const InputDecoration(labelText: 'Review note'),
                    maxLines: 2,
                  ),
                  AppSubmitButton(label: 'Save', busy: _busy, onPressed: _save),
                ],
              ),
              const SizedBox(height: AppSpacing.lg),
              AppFormSection(
                title: 'Enrolment',
                children: [
                  if (enrolledStudentId != null)
                    const ToneBadge('Enrolled — student record created', tone: Tone.good)
                  else
                    _EnrolSection(
                      selectedClassId: _selectedClassId,
                      onClassChanged: (v) => setState(() => _selectedClassId = v),
                      busy: _busy,
                      onEnrol: _enrol,
                    ),
                ],
              ),
            ],
          );
        },
      ),
    );
  }
}

class _EnrolSection extends ConsumerWidget {
  const _EnrolSection({
    required this.selectedClassId,
    required this.onClassChanged,
    required this.busy,
    required this.onEnrol,
  });

  final String? selectedClassId;
  final ValueChanged<String?> onClassChanged;
  final bool busy;
  final VoidCallback onEnrol;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final classes = ref.watch(_classesProvider);

    return classes.when(
      loading: () => const AppInlineLoader(),
      error: (err, _) => ErrorView(error: err, onRetry: () => ref.invalidate(_classesProvider)),
      data: (rows) {
        if (rows.isEmpty) {
          return const Text('No classes set up yet.', style: TextStyle(color: AppColors.ink3));
        }
        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            DropdownButtonFormField<String>(
              initialValue: selectedClassId,
              decoration: const InputDecoration(labelText: 'Admit into class'),
              items: rows
                  .map((c) => DropdownMenuItem(value: c['id'] as String, child: Text(c['name'] as String)))
                  .toList(),
              onChanged: onClassChanged,
            ),
            const SizedBox(height: AppSpacing.md),
            AppSubmitButton(label: 'Enrol', busy: busy, onPressed: onEnrol),
          ],
        );
      },
    );
  }
}
