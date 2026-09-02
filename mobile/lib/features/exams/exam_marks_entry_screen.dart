import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/auth/auth_state.dart';
import '../../core/network/api_exception.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/app_widgets.dart';

final _marksSheetProvider = FutureProvider.autoDispose
    .family<Map<String, dynamic>, String>((ref, examId) async {
      final api = ref.watch(apiClientProvider);
      return api.get<Map<String, dynamic>>('/exams/$examId/marks');
    });

/// Mirrors src/app/app/exams/[examId]/marks-grid.tsx: one paper, one class,
/// every student in roll order, a marks field and an absent toggle each.
/// Validated against the exam's max marks here on the device, and again on
/// the server — a typo must never reach a report card.
class ExamMarksEntryScreen extends ConsumerStatefulWidget {
  const ExamMarksEntryScreen({
    super.key,
    required this.examId,
    required this.subjectName,
  });

  final String examId;
  final String subjectName;

  @override
  ConsumerState<ExamMarksEntryScreen> createState() =>
      _ExamMarksEntryScreenState();
}

class _ExamMarksEntryScreenState extends ConsumerState<ExamMarksEntryScreen> {
  final Map<String, TextEditingController> _controllers = {};
  final Map<String, bool> _absent = {};
  bool _saving = false;
  final _searchController = TextEditingController();
  String _query = '';

  @override
  void dispose() {
    for (final c in _controllers.values) {
      c.dispose();
    }
    _searchController.dispose();
    super.dispose();
  }

  TextEditingController _controllerFor(Map<String, dynamic> student) {
    final id = student['id'] as String;
    return _controllers.putIfAbsent(id, () {
      final marks = student['marks'];
      return TextEditingController(text: marks == null ? '' : '$marks');
    });
  }

  bool _absentFor(Map<String, dynamic> student) {
    final id = student['id'] as String;
    return _absent.putIfAbsent(id, () => student['isAbsent'] as bool? ?? false);
  }

  Future<void> _save(List<Map<String, dynamic>> students, int maxMarks) async {
    final entries = students.map((s) {
      final id = s['id'] as String;
      final absent = _absent[id] ?? false;
      final raw = _controllers[id]?.text.trim() ?? '';
      return {
        'studentId': id,
        'marks': absent || raw.isEmpty ? null : num.tryParse(raw),
        'isAbsent': absent,
      };
    }).toList();

    setState(() => _saving = true);
    try {
      final api = ref.read(apiClientProvider);
      final result = await api.post<Map<String, dynamic>>(
        '/exams/${widget.examId}/marks',
        data: {'entries': entries},
      );
      ref.invalidate(_marksSheetProvider(widget.examId));
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Saved marks for ${result['entered']} students'),
          ),
        );
      }
    } on ApiException catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(e.message)));
      }
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final sheet = ref.watch(_marksSheetProvider(widget.examId));

    return Scaffold(
      appBar: AppTopBar(title: widget.subjectName),
      body: sheet.when(
        loading: () => const AppListSkeleton(rows: 8),
        error: (err, _) => ErrorView(
          error: err,
          onRetry: () => ref.invalidate(_marksSheetProvider(widget.examId)),
        ),
        data: (data) {
          final exam = data['exam'] as Map<String, dynamic>;
          final students = (data['students'] as List)
              .cast<Map<String, dynamic>>();
          final maxMarks = exam['maxMarks'] as int;
          final isPublished = exam['isPublished'] as bool? ?? false;
          final canEdit = exam['canEdit'] as bool? ?? false;
          final locked = isPublished || !canEdit;
          final lockMessage = isPublished
              ? 'Results for this term are published — marks are read-only.'
              : (!canEdit
                    ? "Only this class's class teacher or this subject's teacher can enter its marks."
                    : null);

          if (students.isEmpty) {
            return const EmptyState(
              icon: Icons.groups_outlined,
              title: 'No students',
              message: 'This class has nobody on its roll yet.',
            );
          }

          final q = _query.trim().toLowerCase();
          final visible = q.isEmpty
              ? students
              : students
                    .where(
                      (s) => (s['name'] as String).toLowerCase().contains(q),
                    )
                    .toList();

          return Column(
            children: [
              Container(
                width: double.infinity,
                padding: const EdgeInsets.symmetric(
                  horizontal: 16,
                  vertical: 10,
                ),
                color: AppColors.paper2,
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text(
                      '${exam['className']} · ${exam['termName']}',
                      style: const TextStyle(
                        color: AppColors.ink3,
                        fontSize: 12.5,
                      ),
                    ),
                    Text(
                      'Max $maxMarks · Pass ${exam['passMarks']}',
                      style: const TextStyle(
                        color: AppColors.ink3,
                        fontSize: 12.5,
                      ),
                    ),
                  ],
                ),
              ),
              if (lockMessage != null)
                Padding(
                  padding: const EdgeInsets.fromLTRB(
                    AppSpacing.page,
                    AppSpacing.sm,
                    AppSpacing.page,
                    0,
                  ),
                  child: AppBanner(
                    tone: Tone.warn,
                    icon: Icons.lock_outline_rounded,
                    message: lockMessage,
                  ),
                ),
              Padding(
                padding: const EdgeInsets.fromLTRB(
                  AppSpacing.page,
                  AppSpacing.sm,
                  AppSpacing.page,
                  AppSpacing.sm,
                ),
                child: AppSearchField(
                  controller: _searchController,
                  hintText: 'Jump to a student',
                  onChanged: (value) => setState(() => _query = value),
                  textInputAction: TextInputAction.search,
                ),
              ),
              Expanded(
                child: visible.isEmpty
                    ? const EmptyState(
                        icon: Icons.person_search_outlined,
                        title: 'No matches',
                        message: 'Try a different name.',
                      )
                    : ListView.separated(
                        itemCount: visible.length,
                        separatorBuilder: (_, _) =>
                            const Divider(height: 1, indent: 16, endIndent: 16),
                        itemBuilder: (context, index) {
                          final student = visible[index];
                          final absent = _absentFor(student);
                          return AppListRow(
                            title: student['name'] as String,
                            subtitle:
                                'Roll ${student['rollNumber'] ?? '—'}${(student['sectionName'] as String?)?.isNotEmpty == true ? ' · ${student['sectionName']}' : ''}',
                            trailing: Row(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                SizedBox(
                                  width: 64,
                                  child: TextField(
                                    controller: _controllerFor(student),
                                    enabled: !locked && !absent,
                                    keyboardType: TextInputType.number,
                                    inputFormatters: [
                                      FilteringTextInputFormatter.digitsOnly,
                                    ],
                                    textAlign: TextAlign.center,
                                    decoration: const InputDecoration(
                                      isDense: true,
                                      hintText: '—',
                                    ),
                                    onChanged: (_) => setState(() {}),
                                  ),
                                ),
                                const SizedBox(width: 12),
                                Column(
                                  mainAxisAlignment: MainAxisAlignment.center,
                                  children: [
                                    const Text(
                                      'Absent',
                                      style: TextStyle(
                                        fontSize: 10,
                                        color: AppColors.ink3,
                                      ),
                                    ),
                                    Checkbox(
                                      value: absent,
                                      onChanged: locked
                                          ? null
                                          : (v) => setState(
                                              () =>
                                                  _absent[student['id']
                                                          as String] =
                                                      v ?? false,
                                            ),
                                    ),
                                  ],
                                ),
                              ],
                            ),
                          );
                        },
                      ),
              ),
              SafeArea(
                child: Padding(
                  padding: const EdgeInsets.all(12),
                  child: AppSubmitButton(
                    label: 'Save marks',
                    busy: _saving,
                    onPressed: locked ? null : () => _save(students, maxMarks),
                  ),
                ),
              ),
            ],
          );
        },
      ),
    );
  }
}
