import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/auth/auth_state.dart';
import '../../core/network/api_exception.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/app_widgets.dart';
import 'students_list_screen.dart' show classOptionsProvider;

/// Mirrors src/app/app/students/logins/actions.ts and its page: pick a class
/// (or the whole school), preview who would get a login and who is skipped
/// and why, then issue. Every code in the result is shown here exactly once —
/// there is no screen that can ever show it again, on the web or here.
class StudentLoginsScreen extends ConsumerStatefulWidget {
  const StudentLoginsScreen({super.key});

  @override
  ConsumerState<StudentLoginsScreen> createState() => _StudentLoginsScreenState();
}

class _StudentLoginsScreenState extends ConsumerState<StudentLoginsScreen> {
  String? _classId;
  bool _busy = false;
  Map<String, dynamic>? _preview;
  List<Map<String, dynamic>>? _slips;
  int? _skipped;
  String? _error;

  Future<void> _preview_() async {
    setState(() {
      _busy = true;
      _error = null;
      _preview = null;
      _slips = null;
    });
    try {
      final api = ref.read(apiClientProvider);
      final result = await api.get<Map<String, dynamic>>(
        '/students/logins/preview',
        query: _classId != null ? {'classId': _classId} : null,
      );
      setState(() => _preview = result);
    } on ApiException catch (e) {
      setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _issue() async {
    final plan = _preview?['plan'] as Map<String, dynamic>?;
    final createCount = (plan?['create'] as List?)?.length ?? 0;
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Issue logins?'),
        content: Text(
          'This creates $createCount new login${createCount == 1 ? '' : 's'} for ${_preview?['label'] ?? 'this scope'}. '
          'Every code is shown exactly once, right after this — the office must write them down before leaving this screen.',
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Cancel')),
          FilledButton(onPressed: () => Navigator.pop(context, true), child: const Text('Issue')),
        ],
      ),
    );
    if (confirmed != true) return;

    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final api = ref.read(apiClientProvider);
      final result = await api.post<Map<String, dynamic>>(
        '/students/logins/issue',
        data: {'classId': _classId},
      );
      setState(() {
        _slips = (result['slips'] as List).cast<Map<String, dynamic>>();
        _skipped = result['skipped'] as int?;
        _preview = null;
      });
    } on ApiException catch (e) {
      setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final classes = ref.watch(classOptionsProvider);

    return Scaffold(
      appBar: AppTopBar(title: 'Student logins'),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(AppSpacing.page, 16, AppSpacing.page, 32),
        children: [
          if (_slips == null) ...[
            const SectionHeader('Scope'),
            const SizedBox(height: AppSpacing.sm),
            classes.when(
              loading: () => const AppInlineLoader(),
              error: (err, _) => ErrorView(error: err, onRetry: () => ref.invalidate(classOptionsProvider)),
              data: (options) => DropdownButtonFormField<String?>(
                initialValue: _classId,
                decoration: const InputDecoration(labelText: 'Class'),
                items: [
                  const DropdownMenuItem(value: null, child: Text('The whole school')),
                  for (final c in options) DropdownMenuItem(value: c['id'] as String, child: Text(c['name'] as String)),
                ],
                onChanged: (v) => setState(() {
                  _classId = v;
                  _preview = null;
                  _error = null;
                }),
              ),
            ),
            const SizedBox(height: 16),
            OutlinedButton.icon(
              onPressed: _busy ? null : _preview_,
              icon: const Icon(Icons.visibility_outlined),
              label: const Text('Preview'),
            ),
            if (_error != null) ...[
              const SizedBox(height: 12),
              AppErrorBanner(_error!),
            ],
            if (_busy && _preview == null) ...[
              const SizedBox(height: 24),
              const AppInlineLoader(),
            ],
            if (_preview != null) _PreviewCard(preview: _preview!, onIssue: _busy ? null : _issue),
          ] else
            _SlipsView(slips: _slips!, skipped: _skipped ?? 0, label: 'Issued'),
        ],
      ),
    );
  }
}

class _PreviewCard extends StatelessWidget {
  const _PreviewCard({required this.preview, required this.onIssue});

  final Map<String, dynamic> preview;
  final VoidCallback? onIssue;

  @override
  Widget build(BuildContext context) {
    final plan = preview['plan'] as Map<String, dynamic>;
    final create = (plan['create'] as List).cast<Map<String, dynamic>>();
    final skipped = (plan['skipped'] as List).cast<Map<String, dynamic>>();
    final deliverable = preview['deliverable'] as bool? ?? false;

    return Padding(
      padding: const EdgeInsets.only(top: 20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(preview['label'] as String? ?? '', style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 16)),
          const SizedBox(height: 4),
          Text(
            'Domain: ${preview['domain']}${deliverable ? '' : ' (identifiers only — not a real mailbox)'}',
            style: const TextStyle(color: AppColors.ink3, fontSize: 12.5),
          ),
          const SizedBox(height: 16),
          AppSummaryCard(
            margin: EdgeInsets.zero,
            stats: [
              AppStat(label: 'Will get a login', value: '${create.length}'),
              AppStat(label: 'Skipped', value: '${skipped.length}'),
            ],
          ),
          const SizedBox(height: 16),
          FilledButton(
            onPressed: create.isEmpty ? null : onIssue,
            child: Text(create.isEmpty ? 'Nothing to issue' : 'Issue ${create.length} login${create.length == 1 ? '' : 's'}'),
          ),
          if (skipped.isNotEmpty) ...[
            const SizedBox(height: 20),
            const SectionHeader('Skipped, and why'),
            const SizedBox(height: AppSpacing.sm),
            AppSurface(
              clip: true,
              child: Column(
                children: [
                  for (var i = 0; i < skipped.length; i++) ...[
                    AppListRow(
                      title: skipped[i]['admissionNumber'] as String? ?? '',
                      subtitle: skipped[i]['reason'] as String? ?? '',
                    ),
                    if (i < skipped.length - 1) const Divider(height: 1, indent: 16),
                  ],
                ],
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class _SlipsView extends StatelessWidget {
  const _SlipsView({required this.slips, required this.skipped, required this.label});

  final List<Map<String, dynamic>> slips;
  final int skipped;
  final String label;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        AppBanner(
          tone: Tone.warn,
          icon: Icons.warning_amber_rounded,
          message: 'Each code below is shown exactly once. Write them down or screenshot this screen before leaving it — '
              'they cannot be retrieved again.',
        ),
        const SizedBox(height: 12),
        Text(
          '${slips.length} login${slips.length == 1 ? '' : 's'} issued'
          '${skipped > 0 ? ' · $skipped skipped (already had a login)' : ''}',
          style: const TextStyle(color: AppColors.ink3, fontSize: 12.5),
        ),
        const SizedBox(height: 12),
        AppSurface(
          clip: true,
          child: Column(
            children: [
              for (var i = 0; i < slips.length; i++) ...[
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            SelectableText(
                              '${slips[i]['name']} · ${slips[i]['admissionNumber']}',
                              style: const TextStyle(fontWeight: FontWeight.w600),
                            ),
                            SelectableText(
                              slips[i]['email'] as String? ?? '',
                              style: const TextStyle(color: AppColors.ink3, fontSize: 12.5),
                            ),
                          ],
                        ),
                      ),
                      SelectableText(
                        slips[i]['code'] as String? ?? '',
                        style: const TextStyle(fontWeight: FontWeight.w700, fontFamily: 'monospace', fontSize: 15),
                      ),
                    ],
                  ),
                ),
                if (i < slips.length - 1) const Divider(height: 1, indent: 16),
              ],
            ],
          ),
        ),
      ],
    );
  }
}
