import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/auth/auth_state.dart';
import '../../core/network/api_exception.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/app_widgets.dart';

final _sectionTimetableProvider = FutureProvider.autoDispose.family<Map<String, dynamic>, String>(
  (ref, sectionId) async {
    final api = ref.watch(apiClientProvider);
    return api.get<Map<String, dynamic>>('/timetable/sections/$sectionId');
  },
);

/// A class's subjects plus the school's active staff — the two pickers a
/// period edit needs. Mirrors src/app/api/mobile/v1/settings/subjects/route.ts,
/// whose "teachers" array is already keyed by Staff.id under "staffId" — the
/// id `setPeriod` actually wants.
final _classSubjectsProvider = FutureProvider.autoDispose.family<Map<String, dynamic>, String>(
  (ref, classId) async {
    final api = ref.watch(apiClientProvider);
    return api.get<Map<String, dynamic>>('/settings/subjects', query: {'classId': classId});
  },
);

const _dayNames = ['', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

/// A class teacher's or student's whole-week view of a section —
/// src/lib/queries/timetable.ts::getSectionTimetable. A class teacher's remit
/// is the whole class's week, not just the periods they personally teach
/// (that's the Timetable tab's /timetable/me).
///
/// Passing [classId] additionally turns this into the office's editor for
/// office viewers only (mirrors src/app/app/timetable/page.tsx's
/// office-only inline TimetableEditor) — every other caller (a class
/// teacher's own card, a student's own class) passes no classId and this
/// stays exactly the read-only list it always was.
class ClassTimetableScreen extends ConsumerWidget {
  const ClassTimetableScreen({super.key, required this.sectionId, required this.sectionLabel, this.classId});

  final String sectionId;
  final String sectionLabel;
  final String? classId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final result = ref.watch(_sectionTimetableProvider(sectionId));
    final isOffice = ref.watch(authControllerProvider).actor?.isOffice ?? false;
    final canEdit = isOffice && classId != null;

    return Scaffold(
      appBar: AppTopBar(
        title: sectionLabel,
        subtitle: 'Weekly timetable',
        actions: canEdit
            ? [
                AppIconButton(
                  tooltip: 'Regenerate week',
                  icon: Icons.auto_awesome_outlined,
                  tone: Tone.brand,
                  onPressed: () => _confirmRegenerate(context, ref),
                ),
              ]
            : const [],
      ),
      body: RefreshIndicator(
        onRefresh: () async => ref.invalidate(_sectionTimetableProvider(sectionId)),
        child: result.when(
          loading: () => const AppCardsSkeleton(),
          error: (err, _) => ErrorView(error: err, onRetry: () => ref.invalidate(_sectionTimetableProvider(sectionId))),
          data: (data) {
            final entries = (data['entries'] as List).cast<Map<String, dynamic>>();

            if (entries.isEmpty && !canEdit) {
              return const EmptyState(icon: Icons.calendar_view_week_outlined, title: 'No timetable', message: 'Periods added for this class will appear here.');
            }

            final byDay = <int, Map<int, Map<String, dynamic>>>{};
            for (final e in entries) {
              (byDay[e['dayOfWeek'] as int] ??= {})[e['period'] as int] = e;
            }

            // Mirrors src/app/app/timetable/page.tsx exactly: every weekday
            // is a row whether it has periods yet or not (an editor needs the
            // empty cells to fill in; a read-only week is still a week, not
            // just the days that happen to have something in them), and every
            // row shares the same period columns — Math.max(8, longest day).
            const days = [1, 2, 3, 4, 5, 6];
            final longestDay = entries.isEmpty
                ? 8
                : entries.map((e) => e['period'] as int).reduce((a, b) => a > b ? a : b);
            final periods = List.generate(longestDay < 8 ? 8 : longestDay, (i) => i + 1);
            final classTeacher = (data['section'] as Map?)?['classTeacher'] as String?;
            final todayDow = DateTime.now().weekday; // already Monday=1…Sunday=7, same as _dayNames

            // A vertical scroller (so pull-to-refresh always has something to
            // drag, even on a screen tall enough to show the whole grid)
            // wrapping a grid that scrolls horizontally on its own — the two
            // never fight over the same axis.
            return SingleChildScrollView(
              physics: const AlwaysScrollableScrollPhysics(),
              padding: const EdgeInsets.fromLTRB(AppSpacing.page, 12, AppSpacing.page, 24),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  if (classTeacher != null)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 10),
                      child: Row(
                        children: [
                          const Icon(Icons.school_outlined, size: 15, color: AppColors.ink3),
                          const SizedBox(width: 6),
                          Text('Class teacher: $classTeacher', style: const TextStyle(color: AppColors.ink3, fontSize: 12.5, fontWeight: FontWeight.w600)),
                        ],
                      ),
                    ),
                  _TimetableGrid(
                    days: days,
                    periods: periods,
                    byDay: byDay,
                    todayDow: todayDow,
                    onCellTap: canEdit
                        ? (day, period, entry) => _editPeriod(context, ref, dayOfWeek: day, period: period, entry: entry)
                        : null,
                  ),
                  if (periods.length > 3)
                    Padding(
                      padding: const EdgeInsets.only(top: 10),
                      child: Row(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          const Icon(Icons.swipe_outlined, size: 14, color: AppColors.ink3),
                          const SizedBox(width: 6),
                          Text(
                            'Swipe the table sideways for periods 4–${periods.length}',
                            style: const TextStyle(color: AppColors.ink3, fontSize: 11.5, fontWeight: FontWeight.w600),
                          ),
                        ],
                      ),
                    ),
                ],
              ),
            );
          },
        ),
      ),
    );
  }

  Future<void> _confirmRegenerate(BuildContext context, WidgetRef ref) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('Regenerate this week?'),
        content: const Text(
          "This rebuilds every period for this section from the class's subjects, fitting around every other "
          'section that already has a timetable. Anything you have hand-edited here will be replaced.',
        ),
        actions: [
          TextButton(onPressed: () => Navigator.of(context).pop(false), child: const Text('Cancel')),
          FilledButton(onPressed: () => Navigator.of(context).pop(true), child: const Text('Regenerate')),
        ],
      ),
    );
    if (confirmed != true || !context.mounted) return;

    try {
      final api = ref.read(apiClientProvider);
      final result = await api.post<Map<String, dynamic>>('/timetable/sections/$sectionId/generate', data: const {});
      ref.invalidate(_sectionTimetableProvider(sectionId));
      final placed = result['placed'] as int? ?? 0;
      final free = result['free'] as int? ?? 0;
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(
          content: Text('Placed $placed period${placed == 1 ? '' : 's'}${free > 0 ? ', $free left free' : ''}.'),
        ));
      }
    } on ApiException catch (e) {
      if (context.mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
    }
  }

  void _editPeriod(
    BuildContext context,
    WidgetRef ref, {
    required int dayOfWeek,
    required int period,
    required Map<String, dynamic>? entry,
  }) {
    showAppFormSheet<void>(
      context,
      builder: (_) => _PeriodEditorSheet(
        sectionId: sectionId,
        classId: classId!,
        dayOfWeek: dayOfWeek,
        period: period,
        entry: entry,
        onSaved: () => ref.invalidate(_sectionTimetableProvider(sectionId)),
      ),
    );
  }
}

/// The whole week as one spreadsheet — days down the side, periods across
/// the top, exactly the day×period `<table>` src/app/app/timetable/page.tsx
/// renders on the web. The day column stays put; only the period columns
/// scroll, the same "frozen first column" an office clerk expects of a real
/// timetable chart.
class _TimetableGrid extends StatelessWidget {
  const _TimetableGrid({
    required this.days,
    required this.periods,
    required this.byDay,
    required this.todayDow,
    this.onCellTap,
  });

  final List<int> days;
  final List<int> periods;
  final Map<int, Map<int, Map<String, dynamic>>> byDay;
  final int todayDow;
  final void Function(int day, int period, Map<String, dynamic>? entry)? onCellTap;

  static const _dayColWidth = 56.0;
  static const _periodColWidth = 116.0;
  static const _rowHeight = 60.0;
  static const _headerHeight = 36.0;

  static const _gridBorder = Border(
    right: BorderSide(color: AppColors.line),
    bottom: BorderSide(color: AppColors.line),
  );

  BoxDecoration get _headerDecoration => const BoxDecoration(color: AppColors.paper2, border: _gridBorder);

  BoxDecoration _dayCellDecoration(bool isToday) =>
      BoxDecoration(color: isToday ? AppColors.brandLight : AppColors.paper2, border: _gridBorder);

  @override
  Widget build(BuildContext context) {
    // LayoutBuilder pins down the exact pixel width left over for periods
    // once the frozen day column is subtracted, and hands that to the
    // horizontal SingleChildScrollView as a hard SizedBox — an `Expanded`
    // here was the bug: nested inside a vertically-scrolling ancestor, a Row's
    // cross-axis height constraint is unbounded, and an unbounded `Expanded`
    // resolves by handing its child the content's own width instead of the
    // remaining screen width, so the "scrollable" viewport ended up exactly
    // as wide as the content — nothing to scroll, and anything past the
    // screen edge was just clipped by AppSurface instead of reachable.
    return LayoutBuilder(
      builder: (context, constraints) {
        final periodsWidth = periods.length * _periodColWidth;
        final availableWidth = (constraints.maxWidth - _dayColWidth).clamp(0.0, double.infinity);
        final viewportWidth = periodsWidth < availableWidth ? periodsWidth : availableWidth;

        return AppSurface(
          clip: true,
          padding: EdgeInsets.zero,
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // The frozen "Day" column — laid out plainly alongside the
              // horizontally-scrolling half below, not inside it, so it never
              // moves when the periods scroll past.
              Column(
                children: [
                  Container(
                    width: _dayColWidth,
                    height: _headerHeight,
                    alignment: Alignment.center,
                    decoration: _headerDecoration,
                    child: const Text('Day', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 11, color: AppColors.ink2)),
                  ),
                  for (final day in days)
                    Container(
                      width: _dayColWidth,
                      height: _rowHeight,
                      alignment: Alignment.center,
                      decoration: _dayCellDecoration(day == todayDow),
                      child: Text(
                        _dayNames[day].substring(0, 3),
                        style: TextStyle(
                          fontWeight: FontWeight.w700,
                          fontSize: 12,
                          color: day == todayDow ? AppColors.brandInk : AppColors.ink2,
                        ),
                      ),
                    ),
                ],
              ),
              SizedBox(
                width: viewportWidth,
                child: SingleChildScrollView(
                  scrollDirection: Axis.horizontal,
                  child: Column(
                    children: [
                      Row(
                        children: [
                          for (final p in periods)
                            Container(
                              width: _periodColWidth,
                              height: _headerHeight,
                              alignment: Alignment.center,
                              decoration: _headerDecoration,
                              child: Text('Period $p', style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 11, color: AppColors.ink2)),
                            ),
                        ],
                      ),
                      for (final day in days)
                        Row(
                          children: [
                            for (final p in periods)
                              _TimetableCell(
                                width: _periodColWidth,
                                height: _rowHeight,
                                isToday: day == todayDow,
                                entry: byDay[day]?[p],
                                onTap: onCellTap == null ? null : () => onCellTap!(day, p, byDay[day]?[p]),
                              ),
                          ],
                        ),
                    ],
                  ),
                ),
              ),
            ],
          ),
        );
      },
    );
  }
}

class _TimetableCell extends StatelessWidget {
  const _TimetableCell({
    required this.width,
    required this.height,
    required this.isToday,
    required this.entry,
    this.onTap,
  });

  final double width;
  final double height;
  final bool isToday;
  final Map<String, dynamic>? entry;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final subjectName = entry?['subjectName'] as String?;
    final staffName = entry?['staffName'] as String?;

    final content = Container(
      width: width,
      height: height,
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
      decoration: BoxDecoration(
        color: isToday ? AppColors.brandLight.withValues(alpha: 0.4) : AppColors.card,
        border: const Border(right: BorderSide(color: AppColors.line), bottom: BorderSide(color: AppColors.line)),
      ),
      alignment: subjectName == null ? Alignment.center : Alignment.centerLeft,
      child: subjectName != null
          ? Column(
              mainAxisAlignment: MainAxisAlignment.center,
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(subjectName, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 12.5, color: AppColors.ink)),
                if (staffName != null) ...[
                  const SizedBox(height: 2),
                  Text(staffName, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 11, color: AppColors.ink3)),
                ],
              ],
            )
          : Icon(
              onTap != null ? Icons.add_rounded : Icons.remove_rounded,
              size: 16,
              color: AppColors.ink3.withValues(alpha: onTap != null ? 0.55 : 0.35),
            ),
    );

    return onTap != null ? InkWell(onTap: onTap, child: content) : content;
  }
}

/// Subject + teacher for one period, with the exact same clash rule the web
/// editor enforces — the server checks it again on save, this just shows
/// whatever it says. No client-side pre-computed "busy elsewhere" list here
/// (the web page builds one for a courtesy warning before you even pick);
/// keeping this to one request per save is a deliberate simplification, not
/// an oversight — a conflict is refused with a clear reason either way.
class _PeriodEditorSheet extends ConsumerStatefulWidget {
  const _PeriodEditorSheet({
    required this.sectionId,
    required this.classId,
    required this.dayOfWeek,
    required this.period,
    required this.entry,
    required this.onSaved,
  });

  final String sectionId;
  final String classId;
  final int dayOfWeek;
  final int period;
  final Map<String, dynamic>? entry;
  final VoidCallback onSaved;

  @override
  ConsumerState<_PeriodEditorSheet> createState() => _PeriodEditorSheetState();
}

class _PeriodEditorSheetState extends ConsumerState<_PeriodEditorSheet> {
  String? _subjectId;
  String? _staffId;
  bool _saving = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _subjectId = widget.entry?['subjectId'] as String?;
    _staffId = widget.entry?['staffId'] as String?;
  }

  Future<void> _save({bool clear = false}) async {
    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      final api = ref.read(apiClientProvider);
      await api.post<Map<String, dynamic>>('/timetable/sections/${widget.sectionId}/period', data: {
        'dayOfWeek': widget.dayOfWeek,
        'period': widget.period,
        'subjectId': clear ? null : _subjectId,
        'staffId': clear ? null : _staffId,
      });
      widget.onSaved();
      if (mounted) Navigator.of(context).pop();
    } on ApiException catch (e) {
      setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final subjectsResult = ref.watch(_classSubjectsProvider(widget.classId));

    return AppFormSheet(
      title: '${_dayNames[widget.dayOfWeek]} · Period ${widget.period}',
      actions: [
        OutlinedButton(
          onPressed: _saving ? null : () => Navigator.of(context).pop(),
          child: const Text('Cancel'),
        ),
        AppSubmitButton(label: 'Save', busy: _saving, onPressed: () => _save()),
      ],
      child: subjectsResult.when(
        loading: () => const AppInlineLoader(height: 160),
        error: (err, _) => ErrorView(error: err),
        data: (data) {
          final subjects = (data['subjects'] as List? ?? []).cast<Map<String, dynamic>>();
          // /settings/subjects keys the roster "teachers", each row keyed by
          // "staffId" (not "id") with a ready-made "label" — mirrors
          // src/app/api/mobile/v1/settings/subjects/route.ts exactly.
          final staff = (data['teachers'] as List? ?? []).cast<Map<String, dynamic>>();

          return Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              DropdownButtonFormField<String?>(
                initialValue: _subjectId,
                decoration: const InputDecoration(labelText: 'Subject'),
                items: [
                  const DropdownMenuItem(value: null, child: Text('Free period')),
                  for (final s in subjects) DropdownMenuItem(value: s['id'] as String, child: Text(s['name'] as String? ?? '')),
                ],
                onChanged: (v) => setState(() {
                  _subjectId = v;
                  if (v == null) _staffId = null;
                }),
              ),
              const SizedBox(height: 12),
              DropdownButtonFormField<String?>(
                initialValue: staff.any((s) => s['staffId'] == _staffId) ? _staffId : null,
                decoration: const InputDecoration(labelText: 'Teacher'),
                items: [
                  const DropdownMenuItem(value: null, child: Text('Nobody assigned')),
                  for (final s in staff)
                    DropdownMenuItem(
                      value: s['staffId'] as String,
                      child: Text(s['label'] as String? ?? s['name'] as String? ?? ''),
                    ),
                ],
                onChanged: _subjectId == null ? null : (v) => setState(() => _staffId = v),
              ),
              if (widget.entry != null) ...[
                const SizedBox(height: AppSpacing.sm),
                Align(
                  alignment: Alignment.centerRight,
                  child: TextButton(
                    onPressed: _saving ? null : () => _save(clear: true),
                    child: const Text('Clear period'),
                  ),
                ),
              ],
              if (_error != null) ...[
                const SizedBox(height: AppSpacing.md),
                AppErrorBanner(_error!),
              ],
            ],
          );
        },
      ),
    );
  }
}
