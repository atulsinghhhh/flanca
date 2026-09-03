import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/auth/auth_state.dart';
import '../../core/network/api_exception.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/app_widgets.dart';

final _ptmSlotsProvider = FutureProvider.family<Map<String, dynamic>, String>(
  (ref, sectionId) async {
    final api = ref.watch(apiClientProvider);
    return api.get<Map<String, dynamic>>('/ptm/sections/$sectionId/slots');
  },
);

String _clock(int minutes) {
  final h = minutes ~/ 60;
  final m = minutes % 60;
  final period = h >= 12 ? 'PM' : 'AM';
  final h12 = h % 12 == 0 ? 12 : h % 12;
  return '$h12:${m.toString().padLeft(2, '0')} $period';
}

/// Mirrors src/app/app/ptm's teacher-view (offer/remove slots) and
/// parent-view (book/cancel a slot) for one section.
class PtmSlotsScreen extends ConsumerStatefulWidget {
  const PtmSlotsScreen({
    super.key,
    required this.sectionId,
    required this.sectionLabel,
    required this.asStaff,
    this.studentId,
  });

  final String sectionId;
  final String sectionLabel;
  final bool asStaff;
  final String? studentId;

  @override
  ConsumerState<PtmSlotsScreen> createState() => _PtmSlotsScreenState();
}

class _PtmSlotsScreenState extends ConsumerState<PtmSlotsScreen> {
  Future<void> _book(String slotId) async {
    try {
      final api = ref.read(apiClientProvider);
      await api.post('/ptm/slots/$slotId/book', data: {'studentId': widget.studentId});
      ref.invalidate(_ptmSlotsProvider(widget.sectionId));
    } on ApiException catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
    }
  }

  Future<void> _cancel(String slotId) async {
    try {
      final api = ref.read(apiClientProvider);
      await api.post('/ptm/slots/$slotId/cancel');
      ref.invalidate(_ptmSlotsProvider(widget.sectionId));
    } on ApiException catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
    }
  }

  Future<void> _remove(String slotId) async {
    try {
      final api = ref.read(apiClientProvider);
      await api.delete('/ptm/slots/$slotId');
      ref.invalidate(_ptmSlotsProvider(widget.sectionId));
    } on ApiException catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
    }
  }

  Future<void> _generate() async {
    final dateController = TextEditingController();
    final startController = TextEditingController(text: '15:00');
    final endController = TextEditingController(text: '17:00');
    final durationController = TextEditingController(text: '10');

    final confirmed = await showAppFormSheet<bool>(
      context,
      builder: (context) => AppFormSheet(
        title: 'Offer slots',
        actions: [
          OutlinedButton(onPressed: () => Navigator.pop(context, false), child: const Text('Cancel')),
          AppSubmitButton(label: 'Offer', onPressed: () => Navigator.pop(context, true)),
        ],
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          mainAxisSize: MainAxisSize.min,
          children: [
            TextField(controller: dateController, decoration: const InputDecoration(labelText: 'Date (YYYY-MM-DD)')),
            const SizedBox(height: AppSpacing.md),
            TextField(controller: startController, decoration: const InputDecoration(labelText: 'Start (HH:MM)')),
            const SizedBox(height: AppSpacing.md),
            TextField(controller: endController, decoration: const InputDecoration(labelText: 'End (HH:MM)')),
            const SizedBox(height: AppSpacing.md),
            TextField(
              controller: durationController,
              keyboardType: TextInputType.number,
              decoration: const InputDecoration(labelText: 'Minutes per slot'),
            ),
          ],
        ),
      ),
    );
    if (confirmed != true) return;

    try {
      final api = ref.read(apiClientProvider);
      await api.post('/ptm/sections/${widget.sectionId}/slots', data: {
        'dateIso': dateController.text.trim(),
        'startClock': startController.text.trim(),
        'endClock': endController.text.trim(),
        'durationMinutes': int.tryParse(durationController.text.trim()) ?? 10,
      });
      ref.invalidate(_ptmSlotsProvider(widget.sectionId));
    } on ApiException catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
    }
  }

  @override
  Widget build(BuildContext context) {
    final slots = ref.watch(_ptmSlotsProvider(widget.sectionId));

    return Scaffold(
      appBar: AppTopBar(title: widget.sectionLabel),
      floatingActionButton: widget.asStaff
          ? AppFab(onPressed: _generate, label: 'Offer slots', icon: Icons.add_rounded)
          : null,
      body: slots.when(
        loading: () => const AppListSkeleton(),
        error: (err, _) => ErrorView(error: err, onRetry: () => ref.invalidate(_ptmSlotsProvider(widget.sectionId))),
        data: (data) {
          final rows = (data['slots'] as List).cast<Map<String, dynamic>>();
          if (rows.isEmpty) {
            return const EmptyState(icon: Icons.event_busy_outlined, title: 'No slots yet', message: 'Meeting slots appear here once they are offered.');
          }
          return ListView.separated(
            padding: const EdgeInsets.fromLTRB(
              AppSpacing.page,
              AppSpacing.md,
              AppSpacing.page,
              AppSpacing.bottomSafe,
            ),
            itemCount: rows.length,
            separatorBuilder: (_, _) => const Divider(height: 1, indent: AppSpacing.page, endIndent: AppSpacing.page),
            itemBuilder: (context, index) {
              final slot = rows[index];
              final date = (slot['date'] as String).substring(0, 10);
              final booked = slot['bookedAt'] != null;
              final studentName = (slot['student'] as Map?)?['name'] as String?;

              return AppListRow(
                title: '$date · ${_clock(slot['startMinute'] as int)}–${_clock(slot['endMinute'] as int)}',
                subtitle: booked ? 'Booked${studentName != null ? ' for $studentName' : ''}' : 'Open',
                trailing: widget.asStaff
                    ? (booked
                        ? TextButton(onPressed: () => _cancel(slot['id'] as String), child: const Text('Cancel'))
                        : TextButton(onPressed: () => _remove(slot['id'] as String), child: const Text('Remove')))
                    : (booked
                        ? (studentName == null
                            ? null
                            : TextButton(onPressed: () => _cancel(slot['id'] as String), child: const Text('Cancel')))
                        : FilledButton(onPressed: () => _book(slot['id'] as String), child: const Text('Book'))),
              );
            },
          );
        },
      ),
    );
  }
}
