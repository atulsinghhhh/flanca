import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/auth/auth_state.dart';
import '../../core/network/api_exception.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/app_widgets.dart';
import 'attendance_status_screen.dart' show attendanceStatusProvider;

final _sectionSheetProvider = FutureProvider.autoDispose.family<Map<String, dynamic>, String>(
  (ref, sectionId) async {
    final api = ref.watch(apiClientProvider);
    return api.get<Map<String, dynamic>>('/attendance/sections/$sectionId');
  },
);

const _statuses = ['PRESENT', 'ABSENT', 'LATE', 'LEAVE'];

Tone _toneForStatus(String status) => switch (status) {
      'PRESENT' => Tone.good,
      'ABSENT' => Tone.bad,
      'LATE' => Tone.warn,
      'LEAVE' => Tone.info,
      _ => Tone.neutral,
    };

/// Mirrors src/app/app/attendance/[sectionId]/mark-sheet.tsx: one section's
/// roster for the day, with a per-student status toggle and a bulk
/// "mark all present" shortcut. Writes are idempotent server-side (clientKey),
/// so retrying a flaky save never double-counts a student.
class AttendanceMarkScreen extends ConsumerStatefulWidget {
  const AttendanceMarkScreen({super.key, required this.sectionId, required this.sectionLabel});

  final String sectionId;
  final String sectionLabel;

  @override
  ConsumerState<AttendanceMarkScreen> createState() => _AttendanceMarkScreenState();
}

class _AttendanceMarkScreenState extends ConsumerState<AttendanceMarkScreen> {
  final Map<String, String> _pendingStatus = {};
  bool _saving = false;
  String? _isoDate;

  Future<void> _save(List<Map<String, dynamic>> students) async {
    final marks = students
        .map((s) => {
              'studentId': s['id'],
              'status': _pendingStatus[s['id'] as String] ?? s['status'] ?? 'PRESENT',
            })
        .where((m) => m['status'] != null)
        .toList();

    setState(() => _saving = true);
    try {
      final api = ref.read(apiClientProvider);
      await api.post('/attendance/sections/${widget.sectionId}', data: {'date': _isoDate, 'marks': marks});
      ref.invalidate(_sectionSheetProvider(widget.sectionId));
      // Otherwise the section list this screen was pushed from keeps
      // showing whatever marked/present/absent counts it had on entry,
      // until the user manually pulls to refresh.
      ref.invalidate(attendanceStatusProvider);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Attendance saved')));
      }
    } on ApiException catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  Future<void> _markAllPresent() async {
    setState(() => _saving = true);
    try {
      final api = ref.read(apiClientProvider);
      await api.post('/attendance/sections/${widget.sectionId}/mark-all-present', data: {'date': _isoDate});
      _pendingStatus.clear();
      ref.invalidate(_sectionSheetProvider(widget.sectionId));
      ref.invalidate(attendanceStatusProvider);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Marked all present')));
      }
    } on ApiException catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final sheet = ref.watch(_sectionSheetProvider(widget.sectionId));

    return Scaffold(
      appBar: AppTopBar(title: widget.sectionLabel),
      body: sheet.when(
        loading: () => const AppListSkeleton(rows: 8),
        error: (err, _) => ErrorView(error: err, onRetry: () => ref.invalidate(_sectionSheetProvider(widget.sectionId))),
        data: (data) {
          final students = (data['students'] as List).cast<Map<String, dynamic>>();
          _isoDate ??= (data['date'] as String).substring(0, 10);
          final locked = data['locked'] as bool? ?? false;
          final lockedBy = data['lockedBy'] as String?;

          return Column(
            children: [
              if (locked)
                Padding(
                  padding: const EdgeInsets.fromLTRB(12, 12, 12, 0),
                  child: AppBanner(
                    tone: Tone.neutral,
                    icon: Icons.lock_outline,
                    message: lockedBy != null
                        ? 'Attendance marked by $lockedBy — locked. Ask the office to correct it.'
                        : 'Attendance marked — locked. Ask the office to correct it.',
                  ),
                ),
              Expanded(
                child: ListView.builder(
                  itemCount: students.length,
                  itemBuilder: (context, index) {
                    final s = students[index];
                    final id = s['id'] as String;
                    final current = _pendingStatus[id] ?? s['status'] as String? ?? 'PRESENT';
                    return AppListRow(
                      title: s['name'] as String,
                      subtitle: 'Roll ${s['rollNumber'] ?? '—'}'
                          '${(s['priorAbsences'] as int? ?? 0) > 0 ? ' · ${s['priorAbsences']} day streak absent' : ''}',
                      trailing: DropdownButton<String>(
                        value: current,
                        underline: const SizedBox.shrink(),
                        items: _statuses
                            .map((status) => DropdownMenuItem(
                                  value: status,
                                  child: Text(
                                    status,
                                    style: TextStyle(color: toneColor(_toneForStatus(status)), fontWeight: FontWeight.w700),
                                  ),
                                ))
                            .toList(),
                        onChanged: locked ? null : (value) => setState(() => _pendingStatus[id] = value!),
                      ),
                    );
                  },
                ),
              ),
              SafeArea(
                child: Padding(
                  padding: const EdgeInsets.all(12),
                  child: Row(
                    children: [
                      Expanded(
                        child: OutlinedButton(
                          onPressed: (_saving || locked) ? null : _markAllPresent,
                          child: const Text('Mark all present'),
                        ),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: AppSubmitButton(
                          label: 'Save',
                          busy: _saving,
                          onPressed: locked ? null : () => _save(students),
                        ),
                      ),
                    ],
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
