import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/auth/auth_state.dart';
import '../../core/network/api_exception.dart';
import '../../core/widgets/app_widgets.dart';
import 'homework_list_screen.dart';
import '../../core/theme/app_theme.dart';

final _homeworkSectionsProvider = FutureProvider((ref) async {
  final api = ref.watch(apiClientProvider);
  final data = await api.get<Map<String, dynamic>>('/homework/sections');
  return (data['sections'] as List).cast<Map<String, dynamic>>();
});

/// Mirrors src/app/app/homework/homework-form.tsx: only the sections this
/// person actually stands in front of are offered — the server decides that
/// (GET /homework/sections), this only ever shows what it was given.
class HomeworkFormScreen extends ConsumerStatefulWidget {
  const HomeworkFormScreen({super.key});

  @override
  ConsumerState<HomeworkFormScreen> createState() => _HomeworkFormScreenState();
}

class _HomeworkFormScreenState extends ConsumerState<HomeworkFormScreen> {
  final _titleController = TextEditingController();
  final _detailsController = TextEditingController();
  final _maxMarksController = TextEditingController();
  String? _sectionId;
  String? _subjectId;
  DateTime _dueDate = DateTime.now().add(const Duration(days: 2));
  bool _saving = false;

  @override
  void dispose() {
    _titleController.dispose();
    _detailsController.dispose();
    _maxMarksController.dispose();
    super.dispose();
  }

  Future<void> _pickDueDate() async {
    final picked = await showDatePicker(
      context: context,
      initialDate: _dueDate,
      firstDate: DateTime.now(),
      lastDate: DateTime.now().add(const Duration(days: 365)),
    );
    if (picked != null) setState(() => _dueDate = picked);
  }

  Future<void> _save(bool publish) async {
    if (_sectionId == null || _titleController.text.trim().isEmpty) return;

    setState(() => _saving = true);
    try {
      final api = ref.read(apiClientProvider);
      await api.post('/homework', data: {
        'sectionId': _sectionId,
        'subjectId': _subjectId,
        'title': _titleController.text.trim(),
        'details': _detailsController.text.trim().isEmpty ? null : _detailsController.text.trim(),
        'dueIso': _dueDate.toIso8601String().substring(0, 10),
        'maxMarks': _maxMarksController.text.trim().isEmpty ? null : int.tryParse(_maxMarksController.text.trim()),
        'publish': publish,
      });
      ref.invalidate(homeworkListProvider);
      if (mounted) Navigator.of(context).pop();
    } on ApiException catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final sections = ref.watch(_homeworkSectionsProvider);

    return Scaffold(
      appBar: AppTopBar(title: 'Set homework'),
      body: sections.when(
        loading: () => const AppCardsSkeleton(),
        error: (err, _) => ErrorView(error: err, onRetry: () => ref.invalidate(_homeworkSectionsProvider)),
        data: (options) {
          if (options.isEmpty) {
            return const EmptyState(icon: Icons.assignment_outlined, title: 'No sections', message: 'Homework can be set once you are assigned a section.');
          }
          _sectionId ??= options.first['sectionId'] as String;
          final section = options.firstWhere((s) => s['sectionId'] == _sectionId, orElse: () => options.first);
          final subjects = (section['subjects'] as List).cast<Map<String, dynamic>>();
          if (_subjectId != null && !subjects.any((s) => s['id'] == _subjectId)) _subjectId = null;

          return ListView(
            padding: const EdgeInsets.all(AppSpacing.ml),
            children: [
              AppFormSection(
                title: 'Class & subject',
                children: [
                  DropdownButtonFormField<String>(
                    initialValue: _sectionId,
                    decoration: const InputDecoration(labelText: 'Class'),
                    items: [
                      for (final s in options) DropdownMenuItem(value: s['sectionId'] as String, child: Text(s['label'] as String)),
                    ],
                    onChanged: (v) => setState(() {
                      _sectionId = v;
                      _subjectId = null;
                    }),
                  ),
                  DropdownButtonFormField<String?>(
                    initialValue: _subjectId,
                    decoration: const InputDecoration(labelText: 'Subject (optional)'),
                    items: [
                      const DropdownMenuItem(value: null, child: Text('No specific subject')),
                      for (final s in subjects) DropdownMenuItem(value: s['id'] as String, child: Text(s['name'] as String)),
                    ],
                    onChanged: (v) => setState(() => _subjectId = v),
                  ),
                ],
              ),
              const SizedBox(height: AppSpacing.lg),
              AppFormSection(
                title: 'Homework details',
                children: [
                  TextField(
                    controller: _titleController,
                    decoration: const InputDecoration(labelText: 'Title'),
                    textCapitalization: TextCapitalization.sentences,
                  ),
                  TextField(
                    controller: _detailsController,
                    decoration: const InputDecoration(labelText: 'Details (optional)'),
                    minLines: 3,
                    maxLines: 6,
                    textCapitalization: TextCapitalization.sentences,
                  ),
                  TextField(
                    controller: _maxMarksController,
                    decoration: const InputDecoration(labelText: 'Max marks (optional)'),
                    keyboardType: TextInputType.number,
                  ),
                  AppDateField(
                    label: 'Due date',
                    isoValue: _dueDate.toIso8601String().substring(0, 10),
                    onTap: _pickDueDate,
                  ),
                ],
              ),
              const SizedBox(height: AppSpacing.xl),
              Row(
                children: [
                  Expanded(
                    child: OutlinedButton(
                      onPressed: _saving ? null : () => _save(false),
                      child: const Text('Save as draft'),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: AppSubmitButton(
                      label: 'Set homework',
                      busy: _saving,
                      onPressed: () => _save(true),
                    ),
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
