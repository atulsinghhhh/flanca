import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/auth/auth_state.dart';
import '../../core/format.dart';
import '../../core/network/api_exception.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/app_widgets.dart';

final hostelRoomsProvider = FutureProvider((ref) async {
  final api = ref.watch(apiClientProvider);
  final data = await api.get<Map<String, dynamic>>('/hostel/rooms');
  return (data['rooms'] as List).cast<Map<String, dynamic>>();
});

/// Mirrors src/app/app/hostel/page.tsx's room list: occupancy and current
/// allottees per room, plus the two desk actions a warden/office user needs
/// on the move — giving a child a bed, and ending a stay when they leave.
/// Room create/edit/delete stays a desktop-only workflow; this screen only
/// covers allot/end, per the "genuinely mobile-plausible" brief.
class HostelScreen extends ConsumerStatefulWidget {
  const HostelScreen({super.key});

  @override
  ConsumerState<HostelScreen> createState() => _HostelScreenState();
}

class _HostelScreenState extends ConsumerState<HostelScreen> {
  final Set<String> _busy = {};
  final _searchController = TextEditingController();
  String _query = '';
  int _occupancyFilter = 0; // 0 = All, 1 = Full, 2 = Available

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  Future<void> _allotBed(String roomId) async {
    final result = await showAppFormSheet<Map<String, String>>(
      context,
      builder: (_) => const _AllotBedDialog(),
    );
    if (result == null) return;

    setState(() => _busy.add(roomId));
    try {
      final api = ref.read(apiClientProvider);
      await api.post(
        '/hostel/allotments',
        data: {
          'roomId': roomId,
          'studentId': result['studentId'],
          if ((result['bedNo'] ?? '').isNotEmpty) 'bedNo': result['bedNo'],
        },
      );
      ref.invalidate(hostelRoomsProvider);
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(const SnackBar(content: Text('Bed allotted.')));
      }
    } on ApiException catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(e.message)));
      }
    } finally {
      if (mounted) setState(() => _busy.remove(roomId));
    }
  }

  Future<void> _endAllotment(String allotmentId, String studentName) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('End stay'),
        content: Text(
          '$studentName will be marked as having left this room. The bed becomes free.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.of(context).pop(true),
            child: const Text('Confirm'),
          ),
        ],
      ),
    );
    if (confirmed != true) return;

    setState(() => _busy.add(allotmentId));
    try {
      final api = ref.read(apiClientProvider);
      await api.post('/hostel/allotments/$allotmentId/end');
      ref.invalidate(hostelRoomsProvider);
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(const SnackBar(content: Text('Marked as left.')));
      }
    } on ApiException catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(e.message)));
      }
    } finally {
      if (mounted) setState(() => _busy.remove(allotmentId));
    }
  }

  @override
  Widget build(BuildContext context) {
    final rooms = ref.watch(hostelRoomsProvider);

    return Scaffold(
      appBar: AppTopBar(title: 'Hostel'),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(
              AppSpacing.page,
              AppSpacing.xs,
              AppSpacing.page,
              AppSpacing.sm,
            ),
            child: AppSearchField(
              controller: _searchController,
              hintText: 'Room no., block or warden',
              onChanged: (value) => setState(() => _query = value),
              textInputAction: TextInputAction.search,
            ),
          ),
          Padding(
            padding: const EdgeInsets.only(bottom: AppSpacing.sm),
            child: AppFilterBar(
              labels: const ['All', 'Full', 'Available'],
              selectedIndex: _occupancyFilter,
              onSelected: (index) => setState(() => _occupancyFilter = index),
            ),
          ),
          Expanded(
            child: RefreshIndicator(
              onRefresh: () async => ref.invalidate(hostelRoomsProvider),
              child: rooms.when(
                loading: () => const AppListSkeleton(),
                error: (err, _) => ErrorView(
                  error: err,
                  onRetry: () => ref.invalidate(hostelRoomsProvider),
                ),
                data: (all) {
                  final q = _query.trim().toLowerCase();
                  final rows = all.where((room) {
                    final occupied = room['occupied'] as int;
                    final capacity = room['capacity'] as int;
                    final isFull = capacity > 0 && occupied >= capacity;
                    if (_occupancyFilter == 1 && !isFull) return false;
                    if (_occupancyFilter == 2 && isFull) return false;
                    if (q.isEmpty) return true;
                    final haystack =
                        '${room['roomNo']} ${room['block'] ?? ''} ${room['wardenName'] ?? ''}'
                            .toLowerCase();
                    return haystack.contains(q);
                  }).toList();

                  if (rows.isEmpty) {
                    return EmptyState(
                      icon: Icons.other_houses_outlined,
                      title: all.isEmpty ? 'No rooms yet' : 'No matches',
                      message: all.isEmpty
                          ? 'Hostel rooms appear here once they are added.'
                          : 'Try a different search or filter.',
                    );
                  }
                  return ListView.separated(
                    padding: const EdgeInsets.all(AppSpacing.ml),
                    itemCount: rows.length,
                    separatorBuilder: (_, _) => const SizedBox(height: 12),
                    itemBuilder: (context, index) => _RoomCard(
                      room: rows[index],
                      busy: _busy.contains(rows[index]['id'] as String),
                      onAllot: () => _allotBed(rows[index]['id'] as String),
                      onEnd: _endAllotment,
                    ),
                  );
                },
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _RoomCard extends StatelessWidget {
  const _RoomCard({
    required this.room,
    required this.busy,
    required this.onAllot,
    required this.onEnd,
  });

  final Map<String, dynamic> room;
  final bool busy;
  final VoidCallback onAllot;
  final void Function(String allotmentId, String studentName) onEnd;

  @override
  Widget build(BuildContext context) {
    final occupied = room['occupied'] as int;
    final capacity = room['capacity'] as int;
    final isFull = occupied >= capacity;
    final isNear = capacity > 0 && (capacity - occupied) <= 1;
    final tone = (isFull || isNear) ? Tone.warn : Tone.good;
    final allotments = (room['allotments'] as List)
        .cast<Map<String, dynamic>>();
    final block = room['block'] as String?;
    final wardenName = room['wardenName'] as String?;

    return AppSurface(
      clip: true,
      child: Theme(
        data: Theme.of(context).copyWith(dividerColor: Colors.transparent),
        child: ExpansionTile(
          title: Row(
            children: [
              Expanded(
                child: Text(
                  'Room ${room['roomNo']}${block != null ? ' · $block' : ''}',
                  style: const TextStyle(fontWeight: FontWeight.w700),
                ),
              ),
              const SizedBox(width: 8),
              ToneBadge('$occupied/$capacity', tone: tone),
            ],
          ),
          subtitle: Text(
            wardenName != null ? 'Warden: $wardenName' : 'No warden assigned',
          ),
          childrenPadding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
          children: [
            if (allotments.isEmpty)
              const Align(
                alignment: Alignment.centerLeft,
                child: Padding(
                  padding: EdgeInsets.symmetric(vertical: 8),
                  child: Text(
                    'No one in this room.',
                    style: TextStyle(color: AppColors.ink3),
                  ),
                ),
              )
            else
              ...allotments.map((a) {
                final student = a['student'] as Map<String, dynamic>;
                final allotmentId = a['id'] as String;
                final bedNo = a['bedNo'] as String?;
                final classLabel = [
                  student['class'],
                  student['section'],
                ].where((v) => v != null).join('-');
                return Padding(
                  padding: const EdgeInsets.symmetric(vertical: 6),
                  child: Row(
                    children: [
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              student['name'] as String,
                              style: const TextStyle(
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                            Text(
                              '${bedNo != null ? 'Bed $bedNo · ' : ''}'
                              '${classLabel.isNotEmpty ? '$classLabel · ' : ''}'
                              'since ${formatDay(a['fromDate'] as String)}',
                              style: const TextStyle(
                                color: AppColors.ink3,
                                fontSize: 12.5,
                              ),
                            ),
                          ],
                        ),
                      ),
                      OutlinedButton(
                        onPressed: busy
                            ? null
                            : () =>
                                  onEnd(allotmentId, student['name'] as String),
                        child: const Text('End'),
                      ),
                    ],
                  ),
                );
              }),
            const SizedBox(height: 8),
            AppSubmitButton(
              label: 'Allot bed',
              icon: Icons.bed_outlined,
              busy: busy,
              onPressed: onAllot,
            ),
          ],
        ),
      ),
    );
  }
}

class _AllotBedDialog extends StatefulWidget {
  const _AllotBedDialog();

  @override
  State<_AllotBedDialog> createState() => _AllotBedDialogState();
}

class _AllotBedDialogState extends State<_AllotBedDialog> {
  final _formKey = GlobalKey<FormState>();
  final _studentIdController = TextEditingController();
  final _bedNoController = TextEditingController();

  @override
  void dispose() {
    _studentIdController.dispose();
    _bedNoController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AppFormSheet(
      title: 'Allot a bed',
      subtitle: 'Place a student in this room',
      actions: [
        OutlinedButton(
          onPressed: () => Navigator.of(context).pop(),
          child: const Text('Cancel'),
        ),
        AppSubmitButton(
          label: 'Allot',
          onPressed: () {
            if (_formKey.currentState!.validate()) {
              Navigator.of(context).pop({
                'studentId': _studentIdController.text.trim(),
                'bedNo': _bedNoController.text.trim(),
              });
            }
          },
        ),
      ],
      child: Form(
        key: _formKey,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          mainAxisSize: MainAxisSize.min,
          children: [
            TextFormField(
              controller: _studentIdController,
              autofocus: true,
              decoration: const InputDecoration(labelText: 'Student ID'),
              validator: (v) =>
                  (v == null || v.trim().isEmpty) ? 'Required' : null,
            ),
            const SizedBox(height: AppSpacing.md),
            TextFormField(
              controller: _bedNoController,
              decoration: const InputDecoration(
                labelText: 'Bed number (optional)',
              ),
            ),
          ],
        ),
      ),
    );
  }
}
