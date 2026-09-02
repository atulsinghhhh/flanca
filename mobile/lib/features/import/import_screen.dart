import 'package:dio/dio.dart' show FormData, MultipartFile;
import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/auth/auth_state.dart';
import '../../core/format.dart';
import '../../core/network/api_exception.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/app_widgets.dart';

final _importBatchesProvider = FutureProvider.autoDispose((ref) async {
  final api = ref.watch(apiClientProvider);
  return api.get<Map<String, dynamic>>('/import');
});

enum _Kind { students, staff, feeStructure }

extension on _Kind {
  String get label => switch (this) {
        _Kind.students => 'Students',
        _Kind.staff => 'Staff',
        _Kind.feeStructure => 'Fee structure',
      };
  String get uploadPath => switch (this) {
        _Kind.students => '/import/students',
        _Kind.staff => '/import/staff',
        _Kind.feeStructure => '/import/fee-structure',
      };
  String get hint => switch (this) {
        _Kind.students => 'One row per student. Column names are matched automatically — "Adm.No", "Std", "Sec", "DOB" and the rest are all recognised.',
        _Kind.staff => 'Each row becomes a member of staff with a login, exactly as if you had added them one by one.',
        _Kind.feeStructure => 'One row per class and fee head. The class and the fee head must already exist — this sets what each one charges.',
      };
}

const _kindLabel = {'STUDENTS': 'Students', 'STAFF': 'Staff', 'FEE_STRUCTURE': 'Fee structure'};
const _statusTone = {
  'UPLOADED': Tone.neutral,
  'VALIDATED': Tone.info,
  'APPLIED': Tone.good,
  'REVERTED': Tone.warn,
  'DISCARDED': Tone.neutral,
};
const _statusLabel = {
  'UPLOADED': 'Uploaded',
  'VALIDATED': 'Awaiting approval',
  'APPLIED': 'Applied',
  'REVERTED': 'Undone',
  'DISCARDED': 'Cancelled',
};

/// Mirrors src/app/app/import/**: bring an existing register in from Excel
/// or CSV, see every row before anything is written, approve it, and undo it
/// if it turns out wrong. Column-mapping detail and the full clean-row table
/// stay web-only — this is upload, review the problems, approve or undo.
class ImportScreen extends ConsumerStatefulWidget {
  const ImportScreen({super.key});

  @override
  ConsumerState<ImportScreen> createState() => _ImportScreenState();
}

class _ImportScreenState extends ConsumerState<ImportScreen> {
  _Kind _kind = _Kind.students;
  PlatformFile? _picked;
  bool _uploading;
  String? _error;

  _ImportScreenState() : _uploading = false;

  Future<void> _pickFile() async {
    final file = await FilePicker.pickFile(
      type: FileType.custom,
      allowedExtensions: const ['xlsx', 'xls', 'csv'],
    );
    if (file == null) return;
    setState(() {
      _picked = file;
      _error = null;
    });
  }

  Future<void> _upload() async {
    final file = _picked;
    if (file?.path == null) return;

    setState(() {
      _uploading = true;
      _error = null;
    });
    try {
      final api = ref.read(apiClientProvider);
      final formData = FormData.fromMap({
        'file': await MultipartFile.fromFile(file!.path!, filename: file.name),
      });
      final result = await api.post<Map<String, dynamic>>(_kind.uploadPath, data: formData);
      final batchId = result['batchId'] as String;

      ref.invalidate(_importBatchesProvider);
      if (!mounted) return;
      setState(() => _picked = null);
      await Navigator.of(context).push(
        MaterialPageRoute(builder: (_) => ImportBatchScreen(batchId: batchId)),
      );
      ref.invalidate(_importBatchesProvider);
    } on ApiException catch (e) {
      setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _uploading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final result = ref.watch(_importBatchesProvider);

    return Scaffold(
      appBar: AppTopBar(
        title: 'Import data',
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(52),
          child: Padding(
            padding: const EdgeInsets.only(bottom: AppSpacing.sm),
            child: AppFilterBar(
              labels: _Kind.values.map((k) => k.label).toList(),
              selectedIndex: _kind.index,
              onSelected: (index) => setState(() {
                _kind = _Kind.values[index];
                _picked = null;
                _error = null;
              }),
            ),
          ),
        ),
      ),
      body: RefreshIndicator(
        onRefresh: () async => ref.invalidate(_importBatchesProvider),
        child: ListView(
          padding: const EdgeInsets.fromLTRB(AppSpacing.page, AppSpacing.sm, AppSpacing.page, AppSpacing.xxl),
          children: [
            AppSurface(
              padding: const EdgeInsets.all(AppSpacing.ml),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Text('Import ${_kind.label.toLowerCase()}', style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
                  const SizedBox(height: 4),
                  Text(_kind.hint, style: const TextStyle(color: AppColors.ink3, fontSize: 12.5, height: 1.4)),
                  const SizedBox(height: AppSpacing.ml),
                  OutlinedButton.icon(
                    onPressed: _uploading ? null : _pickFile,
                    icon: const Icon(Icons.attach_file_rounded, size: 18),
                    label: Text(_picked?.name ?? 'Choose your Excel or CSV file'),
                  ),
                  if (_picked != null) ...[
                    const SizedBox(height: AppSpacing.md),
                    AppSubmitButton(label: 'Upload & check', busy: _uploading, onPressed: _upload),
                  ],
                  if (_error != null) ...[
                    const SizedBox(height: AppSpacing.md),
                    AppErrorBanner(_error!),
                  ],
                ],
              ),
            ),
            const SizedBox(height: AppSpacing.md),
            AppBanner(
              message: 'Nothing is written to your school until you review every row and approve it. One tap undoes an approved import too.',
              tone: Tone.info,
              icon: Icons.shield_outlined,
            ),
            const SizedBox(height: AppSpacing.xl),
            const SectionHeader('Import history'),
            const SizedBox(height: AppSpacing.md),
            result.when(
              loading: () => const AppCardsSkeleton(),
              error: (err, _) => ErrorView(error: err, onRetry: () => ref.invalidate(_importBatchesProvider)),
              data: (data) {
                final batches = (data['batches'] as List).cast<Map<String, dynamic>>();
                if (batches.isEmpty) {
                  return const EmptyState(
                    icon: Icons.history_rounded,
                    title: 'No imports yet',
                    message: 'Your first import will appear here with a full record of what changed.',
                  );
                }
                return AppSurface(
                  clip: true,
                  child: ListView.separated(
                    shrinkWrap: true,
                    physics: const NeverScrollableScrollPhysics(),
                    itemCount: batches.length,
                    separatorBuilder: (_, _) => const Divider(height: 1, indent: AppSpacing.page, endIndent: AppSpacing.page),
                    itemBuilder: (context, index) {
                      final b = batches[index];
                      final status = b['status'] as String;
                      return AppListRow(
                        title: b['fileName'] as String,
                        subtitle: '${_kindLabel[b['kind']] ?? b['kind']} · ${formatDay(b['uploadedAt'] as String)} · ${b['totalRows']} rows',
                        showChevron: true,
                        trailing: ToneBadge(_statusLabel[status] ?? status, tone: _statusTone[status] ?? Tone.neutral),
                        onTap: () => Navigator.of(context).push(
                          MaterialPageRoute(builder: (_) => ImportBatchScreen(batchId: b['id'] as String)),
                        ),
                      );
                    },
                  ),
                );
              },
            ),
          ],
        ),
      ),
    );
  }
}

final _importBatchProvider = FutureProvider.autoDispose.family<Map<String, dynamic>, String>((ref, id) async {
  final api = ref.watch(apiClientProvider);
  return api.get<Map<String, dynamic>>('/import/$id');
});

const _rowLimitShown = 100;

/// Review a single batch: what's wrong (shown first), what's ready, and the
/// approve/undo/discard actions. Mirrors src/app/app/import/[id]/page.tsx
/// minus the column-mapping table, which is a desk-work detail.
class ImportBatchScreen extends ConsumerStatefulWidget {
  const ImportBatchScreen({super.key, required this.batchId});

  final String batchId;

  @override
  ConsumerState<ImportBatchScreen> createState() => _ImportBatchScreenState();
}

class _ImportBatchScreenState extends ConsumerState<ImportBatchScreen> {
  bool _acting = false;

  Future<void> _apply() async {
    setState(() => _acting = true);
    try {
      final api = ref.read(apiClientProvider);
      final result = await api.post<Map<String, dynamic>>('/import/${widget.batchId}/apply');
      ref.invalidate(_importBatchProvider(widget.batchId));
      if (!mounted) return;
      await showDialog<void>(
        context: context,
        builder: (_) => AlertDialog(
          title: const Text('Imported'),
          content: Text('Created ${result['created'] ?? 0}, updated ${result['updated'] ?? 0}.'),
          actions: [FilledButton(onPressed: () => Navigator.of(context).pop(), child: const Text('OK'))],
        ),
      );
    } on ApiException catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
    } finally {
      if (mounted) setState(() => _acting = false);
    }
  }

  Future<void> _revert() async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('Undo this import?'),
        content: const Text('Removes what this import added. Anything that already has fees, attendance, marks, or a login used elsewhere is kept.'),
        actions: [
          TextButton(onPressed: () => Navigator.of(context).pop(false), child: const Text('Cancel')),
          FilledButton(onPressed: () => Navigator.of(context).pop(true), child: const Text('Undo import')),
        ],
      ),
    );
    if (confirmed != true) return;

    setState(() => _acting = true);
    try {
      final api = ref.read(apiClientProvider);
      await api.post<Map<String, dynamic>>('/import/${widget.batchId}/revert');
      ref.invalidate(_importBatchProvider(widget.batchId));
    } on ApiException catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
    } finally {
      if (mounted) setState(() => _acting = false);
    }
  }

  Future<void> _discard() async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('Cancel this import?'),
        content: const Text('Nothing was written, so there is nothing to undo — this just closes it out.'),
        actions: [
          TextButton(onPressed: () => Navigator.of(context).pop(false), child: const Text('Keep it')),
          FilledButton(onPressed: () => Navigator.of(context).pop(true), child: const Text('Cancel import')),
        ],
      ),
    );
    if (confirmed != true) return;

    setState(() => _acting = true);
    try {
      final api = ref.read(apiClientProvider);
      await api.post<Map<String, dynamic>>('/import/${widget.batchId}/discard');
      ref.invalidate(_importBatchProvider(widget.batchId));
    } on ApiException catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
    } finally {
      if (mounted) setState(() => _acting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final result = ref.watch(_importBatchProvider(widget.batchId));

    return Scaffold(
      appBar: const AppTopBar(title: 'Review import'),
      body: RefreshIndicator(
        onRefresh: () async => ref.invalidate(_importBatchProvider(widget.batchId)),
        child: result.when(
          loading: () => const AppDetailSkeleton(),
          error: (err, _) => ErrorView(error: err, onRetry: () => ref.invalidate(_importBatchProvider(widget.batchId))),
          data: (data) {
            final batch = data['batch'] as Map<String, dynamic>;
            final problemRows = (data['problemRows'] as List).cast<Map<String, dynamic>>();
            final cleanRows = (data['cleanRows'] as List).cast<Map<String, dynamic>>();
            final kind = batch['kind'] as String;
            final status = batch['status'] as String;

            return ListView(
              padding: const EdgeInsets.fromLTRB(AppSpacing.page, AppSpacing.sm, AppSpacing.page, AppSpacing.xxl),
              children: [
                Text(batch['fileName'] as String, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 17)),
                const SizedBox(height: 4),
                Row(
                  children: [
                    ToneBadge(_statusLabel[status] ?? status, tone: _statusTone[status] ?? Tone.neutral),
                    const SizedBox(width: 8),
                    Text(_kindLabel[kind] ?? kind, style: const TextStyle(color: AppColors.ink3, fontSize: 12.5)),
                  ],
                ),
                const SizedBox(height: AppSpacing.lg),
                AppSummaryCard(
                  margin: EdgeInsets.zero,
                  stats: [
                    AppStat(label: 'Rows in file', value: '${batch['totalRows']}'),
                    AppStat(label: 'Ready', value: '${batch['okRows']}', tone: Tone.good),
                    AppStat(label: 'Warnings', value: '${batch['warningRows']}', tone: (batch['warningRows'] as int) > 0 ? Tone.warn : null),
                    AppStat(label: 'Errors', value: '${batch['errorRows']}', tone: (batch['errorRows'] as int) > 0 ? Tone.bad : null),
                  ],
                ),
                const SizedBox(height: AppSpacing.lg),
                if (status == 'VALIDATED') ...[
                  AppBanner(
                    message: 'Nothing has been written to your school yet. Look through the rows below, then approve.',
                    tone: Tone.info,
                    icon: Icons.visibility_outlined,
                  ),
                  const SizedBox(height: AppSpacing.md),
                  Row(
                    children: [
                      Expanded(
                        child: OutlinedButton(onPressed: _acting ? null : _discard, child: const Text('Discard')),
                      ),
                      const SizedBox(width: AppSpacing.md),
                      Expanded(
                        flex: 2,
                        child: AppSubmitButton(label: 'Approve & import', busy: _acting, onPressed: _apply),
                      ),
                    ],
                  ),
                ] else if (status == 'APPLIED') ...[
                  AppBanner(
                    message: 'Applied ${batch['appliedRows']} rows${batch['appliedAt'] != null ? ' on ${formatDay(batch['appliedAt'] as String)}' : ''}. You can still undo this.',
                    tone: Tone.good,
                    icon: Icons.check_circle_outline_rounded,
                  ),
                  const SizedBox(height: AppSpacing.md),
                  AppSubmitButton(label: 'Undo import', busy: _acting, onPressed: _revert),
                ] else if (status == 'REVERTED') ...[
                  AppBanner(
                    message: 'Undone${batch['revertedAt'] != null ? ' on ${formatDay(batch['revertedAt'] as String)}' : ''}.',
                    tone: Tone.warn,
                    icon: Icons.undo_rounded,
                  ),
                ] else ...[
                  AppBanner(
                    message: 'This import was cancelled before anything was written.',
                    tone: Tone.neutral,
                    icon: Icons.block_outlined,
                  ),
                ],

                if (problemRows.isNotEmpty) ...[
                  const SizedBox(height: AppSpacing.xl),
                  SectionHeader('Rows needing a look (${batch['errorRows'] + batch['warningRows']})'),
                  const SizedBox(height: AppSpacing.md),
                  AppSurface(
                    clip: true,
                    child: ListView.separated(
                      shrinkWrap: true,
                      physics: const NeverScrollableScrollPhysics(),
                      itemCount: problemRows.length,
                      separatorBuilder: (_, _) => const Divider(height: 1, indent: AppSpacing.page, endIndent: AppSpacing.page),
                      itemBuilder: (context, index) => _RowTile(kind: kind, row: problemRows[index]),
                    ),
                  ),
                ],

                const SizedBox(height: AppSpacing.xl),
                SectionHeader(status == 'APPLIED' ? 'Imported rows (${batch['okRows']})' : 'Rows ready to import (${batch['okRows']})'),
                const SizedBox(height: AppSpacing.md),
                if (cleanRows.isEmpty)
                  const Padding(
                    padding: EdgeInsets.symmetric(vertical: AppSpacing.lg),
                    child: Text('No clean rows in this file.', style: TextStyle(color: AppColors.ink3)),
                  )
                else ...[
                  AppSurface(
                    clip: true,
                    child: ListView.separated(
                      shrinkWrap: true,
                      physics: const NeverScrollableScrollPhysics(),
                      itemCount: cleanRows.length > _rowLimitShown ? _rowLimitShown : cleanRows.length,
                      separatorBuilder: (_, _) => const Divider(height: 1, indent: AppSpacing.page, endIndent: AppSpacing.page),
                      itemBuilder: (context, index) => _RowTile(kind: kind, row: cleanRows[index]),
                    ),
                  ),
                  if (cleanRows.length > _rowLimitShown)
                    Padding(
                      padding: const EdgeInsets.only(top: AppSpacing.sm),
                      child: Text(
                        'Showing the first $_rowLimitShown of ${cleanRows.length} clean rows. All of them will be imported.',
                        style: const TextStyle(color: AppColors.ink3, fontSize: 12.5),
                      ),
                    ),
                ],
              ],
            );
          },
        ),
      ),
    );
  }
}

class _RowTile extends StatelessWidget {
  const _RowTile({required this.kind, required this.row});

  final String kind;
  final Map<String, dynamic> row;

  @override
  Widget build(BuildContext context) {
    final parsed = (row['parsed'] as Map?)?.cast<String, dynamic>() ?? const {};
    final messages = (row['messages'] as List? ?? []).cast<Map<String, dynamic>>();
    final isError = row['state'] == 'ERROR';

    final (title, subtitle) = switch (kind) {
      'STAFF' => (
          parsed['name'] as String? ?? '—',
          [parsed['email'], parsed['designation']].whereType<String>().where((s) => s.isNotEmpty).join(' · '),
        ),
      'FEE_STRUCTURE' => (
          parsed['feeHeadName'] as String? ?? '—',
          [parsed['className'], if (parsed['amount'] is num) formatMoney((parsed['amount'] as num).round())]
              .whereType<String>()
              .join(' · '),
        ),
      _ => (
          parsed['name'] as String? ?? '—',
          [
            parsed['admissionNumber'],
            [parsed['className'], parsed['sectionName']].whereType<String>().where((s) => s.isNotEmpty).join(' '),
          ].whereType<String>().where((s) => s.isNotEmpty).join(' · '),
        ),
    };

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: AppSpacing.lg, vertical: 12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              SizedBox(
                width: 28,
                child: Text('${row['rowNumber']}', style: const TextStyle(color: AppColors.ink3, fontSize: 12)),
              ),
              Expanded(
                child: Text(title, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 14.5)),
              ),
            ],
          ),
          if (subtitle.isNotEmpty)
            Padding(
              padding: const EdgeInsets.only(left: 28, top: 2),
              child: Text(subtitle, style: const TextStyle(color: AppColors.ink3, fontSize: 12.5)),
            ),
          for (final m in messages)
            Padding(
              padding: const EdgeInsets.only(left: 28, top: 4),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Icon(
                    m['level'] == 'ERROR' ? Icons.error_outline_rounded : Icons.warning_amber_rounded,
                    size: 14,
                    color: toneColor(m['level'] == 'ERROR' ? Tone.bad : Tone.warn),
                  ),
                  const SizedBox(width: 6),
                  Expanded(
                    child: Text(
                      m['message'] as String,
                      style: TextStyle(fontSize: 12.5, color: toneColor(isError ? Tone.bad : Tone.warn)),
                    ),
                  ),
                ],
              ),
            ),
        ],
      ),
    );
  }
}
