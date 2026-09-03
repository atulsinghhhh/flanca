import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/auth/auth_state.dart';
import '../../core/network/api_exception.dart';
import '../../core/widgets/app_widgets.dart';
import '../../core/theme/app_theme.dart';

final _homeworkDetailProvider = FutureProvider.family<Map<String, dynamic>, String>(
  (ref, id) async {
    final api = ref.watch(apiClientProvider);
    return api.get<Map<String, dynamic>>('/homework/$id');
  },
);

/// Mirrors src/app/app/homework/[id]/page.tsx's three views (manage/student/
/// parent), branching on the `view` field the mobile GET already computes.
class HomeworkDetailScreen extends ConsumerStatefulWidget {
  const HomeworkDetailScreen({super.key, required this.homeworkId});

  final String homeworkId;

  @override
  ConsumerState<HomeworkDetailScreen> createState() => _HomeworkDetailScreenState();
}

class _HomeworkDetailScreenState extends ConsumerState<HomeworkDetailScreen> {
  final _noteController = TextEditingController();
  bool _busy = false;

  @override
  void dispose() {
    _noteController.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    setState(() => _busy = true);
    try {
      final api = ref.read(apiClientProvider);
      await api.post('/homework/${widget.homeworkId}/submit', data: {
        if (_noteController.text.trim().isNotEmpty) 'note': _noteController.text.trim(),
      });
      ref.invalidate(_homeworkDetailProvider(widget.homeworkId));
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Submitted')));
    } on ApiException catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _grade(String submissionId, int? currentMarks) async {
    final controller = TextEditingController(text: currentMarks?.toString() ?? '');
    final marks = await showDialog<int>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Grade submission'),
        content: TextField(
          controller: controller,
          keyboardType: TextInputType.number,
          decoration: const InputDecoration(labelText: 'Marks'),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context), child: const Text('Cancel')),
          FilledButton(
            onPressed: () => Navigator.pop(context, int.tryParse(controller.text)),
            child: const Text('Save'),
          ),
        ],
      ),
    );
    if (marks == null) return;
    try {
      final api = ref.read(apiClientProvider);
      await api.post('/homework/submissions/$submissionId/grade', data: {'marks': marks});
      ref.invalidate(_homeworkDetailProvider(widget.homeworkId));
    } on ApiException catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
    }
  }

  @override
  Widget build(BuildContext context) {
    final detail = ref.watch(_homeworkDetailProvider(widget.homeworkId));

    return Scaffold(
      appBar: AppTopBar(title: 'Homework'),
      body: detail.when(
        loading: () => const AppDetailSkeleton(),
        error: (err, _) => ErrorView(error: err, onRetry: () => ref.invalidate(_homeworkDetailProvider(widget.homeworkId))),
        data: (data) {
          final hw = data['homework'] as Map<String, dynamic>;
          final view = data['view'] as String;

          return ListView(
            padding: const EdgeInsets.all(AppSpacing.ml),
            children: [
              Text(hw['title'] as String, style: Theme.of(context).textTheme.titleLarge),
              if ((hw['details'] as String?)?.isNotEmpty ?? false) ...[
                const SizedBox(height: 8),
                Text(hw['details'] as String),
              ],
              const SizedBox(height: 16),
              if (view == 'student') ..._studentView(data),
              if (view == 'manage') ..._manageView(data),
              if (view == 'parent') ..._parentView(data),
              if (view == 'status')
                Chip(label: Text('Status: ${hw['status']}')),
            ],
          );
        },
      ),
    );
  }

  List<Widget> _studentView(Map<String, dynamic> data) {
    final mine = data['mine'] as Map<String, dynamic>?;
    final canSubmit = data['canSubmit'] as bool? ?? false;

    if (mine != null) {
      return [
        Text('Submitted ${(mine['submittedAt'] as String).substring(0, 10)}'),
        if (mine['marks'] != null) Text('Marks: ${mine['marks']}'),
        if ((mine['feedback'] as String?)?.isNotEmpty ?? false) Text('Feedback: ${mine['feedback']}'),
      ];
    }
    return [
      TextField(
        controller: _noteController,
        decoration: const InputDecoration(labelText: 'Note (optional)'),
        maxLines: 3,
      ),
      const SizedBox(height: 12),
      AppSubmitButton(
        label: 'Submit',
        busy: _busy,
        onPressed: canSubmit ? _submit : null,
      ),
      if (!canSubmit && (data['whyNot'] as String?) != null)
        Padding(
          padding: const EdgeInsets.only(top: 8),
          child: Text(data['whyNot'] as String, style: Theme.of(context).textTheme.bodySmall),
        ),
    ];
  }

  List<Widget> _manageView(Map<String, dynamic> data) {
    final roster = (data['roster'] as List).cast<Map<String, dynamic>>();
    return [
      Text('Submissions', style: Theme.of(context).textTheme.titleMedium),
      const SizedBox(height: 8),
      AppSurface(
        clip: true,
        child: Column(
          children: [
            for (var i = 0; i < roster.length; i++) ...[
              AppListRow(
                title: roster[i]['name'] as String,
                subtitle: roster[i]['submittedAt'] != null
                    ? 'Submitted${roster[i]['marks'] != null ? ' · ${roster[i]['marks']} marks' : ''}'
                    : 'Not submitted',
                trailing: roster[i]['submissionId'] != null
                    ? TextButton(
                        onPressed: () => _grade(roster[i]['submissionId'] as String, roster[i]['marks'] as int?),
                        child: const Text('Grade'),
                      )
                    : null,
              ),
              if (i < roster.length - 1)
                const Divider(height: 1, indent: AppSpacing.page, endIndent: AppSpacing.page),
            ],
          ],
        ),
      ),
    ];
  }

  List<Widget> _parentView(Map<String, dynamic> data) {
    final children = (data['children'] as List).cast<Map<String, dynamic>>();
    return [
      AppSurface(
        clip: true,
        child: Column(
          children: [
            for (var i = 0; i < children.length; i++) ...[
              AppListRow(
                title: children[i]['name'] as String,
                subtitle: (children[i]['submission'] as Map<String, dynamic>?) == null
                    ? 'Not submitted'
                    : 'Submitted'
                        '${(children[i]['submission'] as Map<String, dynamic>)['marks'] != null ? ' · ${(children[i]['submission'] as Map<String, dynamic>)['marks']} marks' : ''}',
              ),
              if (i < children.length - 1)
                const Divider(height: 1, indent: AppSpacing.page, endIndent: AppSpacing.page),
            ],
          ],
        ),
      ),
    ];
  }
}
