import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/auth/auth_state.dart';
import '../../core/network/api_exception.dart';
import '../../core/format.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/app_widgets.dart';

/// Office CRUD over routes/stops/boarding — separate from [TransportScreen]
/// (transport_screen.dart), which is the read-only "my child's bus" view for
/// parents/students. Mirrors src/app/app/transport/page.tsx's office view:
/// every active route, its stops, and who is riding, with the actions that
/// keep that true — add/edit/delete a route, add/delete a stop, board/unboard
/// a student.
final transportOfficeRoutesProvider = FutureProvider.autoDispose((ref) async {
  final api = ref.watch(apiClientProvider);
  final data = await api.get<Map<String, dynamic>>('/transport/routes');
  return (data['routes'] as List).cast<Map<String, dynamic>>();
});

class TransportOfficeScreen extends ConsumerStatefulWidget {
  const TransportOfficeScreen({super.key});

  @override
  ConsumerState<TransportOfficeScreen> createState() =>
      _TransportOfficeScreenState();
}

class _TransportOfficeScreenState extends ConsumerState<TransportOfficeScreen> {
  final _searchController = TextEditingController();
  String _query = '';

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final routes = ref.watch(transportOfficeRoutesProvider);

    return Scaffold(
      appBar: AppTopBar(title: 'Transport (office)'),
      floatingActionButton: AppFab(
        tooltip: 'New route',
        icon: Icons.add_rounded,
        onPressed: () => showAppFormSheet<void>(
          context,
          builder: (_) => const _RouteFormDialog(),
        ),
      ),
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
              hintText: 'Route name or vehicle no.',
              onChanged: (value) => setState(() => _query = value),
              textInputAction: TextInputAction.search,
            ),
          ),
          Expanded(
            child: RefreshIndicator(
              onRefresh: () async =>
                  ref.invalidate(transportOfficeRoutesProvider),
              child: routes.when(
                loading: () => const AppListSkeleton(),
                error: (err, _) => ErrorView(
                  error: err,
                  onRetry: () => ref.invalidate(transportOfficeRoutesProvider),
                ),
                data: (all) {
                  final q = _query.trim().toLowerCase();
                  final rows = q.isEmpty
                      ? all
                      : all.where((route) {
                          final haystack =
                              '${route['name']} ${route['vehicleNo'] ?? ''}'
                                  .toLowerCase();
                          return haystack.contains(q);
                        }).toList();

                  if (rows.isEmpty) {
                    return ListView(
                      children: [
                        EmptyState(
                          icon: Icons.directions_bus_outlined,
                          title: all.isEmpty ? 'No routes yet' : 'No matches',
                          message: all.isEmpty
                              ? 'Bus routes appear here once they are added.'
                              : 'Try a different search.',
                        ),
                      ],
                    );
                  }
                  return ListView.separated(
                    padding: const EdgeInsets.only(
                      top: AppSpacing.sm,
                      bottom: AppSpacing.bottomSafe,
                    ),
                    itemCount: rows.length,
                    separatorBuilder: (_, _) => const Divider(
                      height: 1,
                      indent: AppSpacing.page,
                      endIndent: AppSpacing.page,
                    ),
                    itemBuilder: (context, index) {
                      final route = rows[index];
                      final stops = (route['stops'] as List)
                          .cast<Map<String, dynamic>>();
                      final onBoard = route['onBoard'] as int;
                      return AppListRow(
                        title: route['name'] as String,
                        titleWidget: Row(
                          children: [
                            Expanded(
                              child: Text(
                                route['name'] as String,
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: const TextStyle(
                                  fontWeight: FontWeight.w600,
                                  fontSize: 15,
                                  letterSpacing: -0.2,
                                ),
                              ),
                            ),
                            if (route['vehicleNo'] != null) ...[
                              const SizedBox(width: 8),
                              ToneBadge(
                                route['vehicleNo'] as String,
                                tone: Tone.neutral,
                              ),
                            ],
                          ],
                        ),
                        subtitle:
                            '${stops.length} ${stops.length == 1 ? 'stop' : 'stops'} · $onBoard on board',
                        showChevron: true,
                        onTap: () => Navigator.of(context).push(
                          MaterialPageRoute(
                            builder: (_) => TransportRouteDetailScreen(
                              routeId: route['id'] as String,
                            ),
                          ),
                        ),
                      );
                    },
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

/// One route's stops and riders, plus the actions to change either. Reads off
/// the same [transportOfficeRoutesProvider] list (there is no per-route GET
/// endpoint), so any mutation just invalidates that provider and this screen
/// re-renders with the fresh copy.
class TransportRouteDetailScreen extends ConsumerWidget {
  const TransportRouteDetailScreen({super.key, required this.routeId});

  final String routeId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final routes = ref.watch(transportOfficeRoutesProvider);

    return Scaffold(
      appBar: AppTopBar(title: 'Route'),
      body: routes.when(
        loading: () => const AppDetailSkeleton(),
        error: (err, _) => ErrorView(
          error: err,
          onRetry: () => ref.invalidate(transportOfficeRoutesProvider),
        ),
        data: (rows) {
          final route = rows.cast<Map<String, dynamic>?>().firstWhere(
            (r) => r?['id'] == routeId,
            orElse: () => null,
          );
          if (route == null) {
            return const EmptyState(
              icon: Icons.directions_bus_outlined,
              title: 'Route not found',
              message: 'This bus route is no longer on record.',
            );
          }
          return _RouteDetailBody(route: route);
        },
      ),
    );
  }
}

class _RouteDetailBody extends ConsumerWidget {
  const _RouteDetailBody({required this.route});

  final Map<String, dynamic> route;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final stops = (route['stops'] as List).cast<Map<String, dynamic>>();
    final students = (route['students'] as List).cast<Map<String, dynamic>>();
    final removable = route['removable'] as bool? ?? false;
    final whyNot = route['whyNot'] as String?;

    return ListView(
      padding: const EdgeInsets.all(AppSpacing.ml),
      children: [
        AppSurface(
          padding: const EdgeInsets.all(AppSpacing.ml),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Expanded(
                    child: Text(
                      route['name'] as String,
                      style: Theme.of(context).textTheme.titleLarge,
                    ),
                  ),
                  if (route['vehicleNo'] != null)
                    ToneBadge(
                      route['vehicleNo'] as String,
                      tone: Tone.neutral,
                    ),
                ],
              ),
              const SizedBox(height: 12),
              Row(
                children: [
                  Expanded(
                    child: OutlinedButton(
                      onPressed: () => showAppFormSheet<void>(
                        context,
                        builder: (_) => _RouteFormDialog(route: route),
                      ),
                      child: const Text('Edit route'),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: OutlinedButton(
                      onPressed: removable
                          ? () => _confirmDeleteRoute(context, ref)
                          : null,
                      style: OutlinedButton.styleFrom(
                        foregroundColor: AppColors.overdue,
                      ),
                      child: const Text('Delete route'),
                    ),
                  ),
                ],
              ),
              if (!removable && whyNot != null) ...[
                const SizedBox(height: 8),
                Text(
                  whyNot,
                  style: const TextStyle(
                    color: AppColors.ink3,
                    fontSize: 12.5,
                  ),
                ),
              ],
            ],
          ),
        ),
        // Driver/attendant/capacity used to print as a stack of plain Text
        // lines under the header card — this is exactly the label/value shape
        // AppKeyValue exists for, and grouping them lets a route with only a
        // capacity (no driver assigned yet) still read as a tidy panel rather
        // than a ragged single line.
        if (route['driverName'] != null ||
            route['attendantName'] != null ||
            route['capacity'] != null) ...[
          const SizedBox(height: 12),
          AppKeyValueGroup(
            rows: [
              if (route['driverName'] != null)
                AppKeyValue(
                  label: 'Driver',
                  value:
                      '${route['driverName']}${route['driverPhone'] != null ? ' · ${route['driverPhone']}' : ''}',
                ),
              if (route['attendantName'] != null)
                AppKeyValue(
                  label: 'Attendant',
                  value: route['attendantName'] as String,
                ),
              if (route['capacity'] != null)
                AppKeyValue(
                  label: 'Capacity',
                  value: '${route['capacity']} seats',
                ),
            ],
          ),
        ],
        const SizedBox(height: 20),
        SectionHeader(
          'Stops',
          trailing: TextButton.icon(
            onPressed: () => showAppFormSheet<void>(
              context,
              builder: (_) => _StopFormDialog(routeId: route['id'] as String),
            ),
            icon: const Icon(Icons.add, size: 18),
            label: const Text('Add stop'),
          ),
        ),
        if (stops.isEmpty)
          const Padding(
            padding: EdgeInsets.symmetric(vertical: 12),
            child: Text(
              'No stops on this route yet.',
              style: TextStyle(color: AppColors.ink3),
            ),
          )
        else
          AppSurface(
            clip: true,
            child: Column(
              children: [
                for (var i = 0; i < stops.length; i++) ...[
                  _StopTile(routeId: route['id'] as String, stop: stops[i]),
                  if (i != stops.length - 1)
                    const Divider(height: 1, indent: 16, endIndent: 16),
                ],
              ],
            ),
          ),
        const SizedBox(height: 20),
        SectionHeader(
          'Riders',
          trailing: TextButton.icon(
            onPressed: () => showAppFormSheet<void>(
              context,
              builder: (_) => _BoardFormDialog(
                routeId: route['id'] as String,
                stops: stops,
              ),
            ),
            icon: const Icon(Icons.person_add_alt_1, size: 18),
            label: const Text('Board student'),
          ),
        ),
        if (students.isEmpty)
          const Padding(
            padding: EdgeInsets.symmetric(vertical: 12),
            child: Text(
              'Nobody is on this route yet.',
              style: TextStyle(color: AppColors.ink3),
            ),
          )
        else
          AppSurface(
            clip: true,
            child: Column(
              children: [
                for (var i = 0; i < students.length; i++) ...[
                  _RiderTile(rider: students[i]),
                  if (i != students.length - 1)
                    const Divider(height: 1, indent: 16, endIndent: 16),
                ],
              ],
            ),
          ),
      ],
    );
  }

  Future<void> _confirmDeleteRoute(BuildContext context, WidgetRef ref) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('Delete route?'),
        content: Text('Remove ${route['name']}? This cannot be undone.'),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.of(context).pop(true),
            child: const Text('Delete'),
          ),
        ],
      ),
    );
    if (confirmed != true) return;
    try {
      final api = ref.read(apiClientProvider);
      await api.delete('/transport/routes/${route['id']}');
      ref.invalidate(transportOfficeRoutesProvider);
      if (context.mounted) Navigator.of(context).pop();
    } on ApiException catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(e.message)));
      }
    }
  }
}

class _StopTile extends ConsumerWidget {
  const _StopTile({required this.routeId, required this.stop});

  final String routeId;
  final Map<String, dynamic> stop;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final removable = stop['removable'] as bool? ?? false;
    final whyNot = stop['whyNot'] as String?;
    final monthlyFee = stop['monthlyFee'] as int;
    final riders = stop['students'] as int;

    return AppListRow(
      title: stop['name'] as String,
      subtitle: [
        '${formatMoney(monthlyFee)}/mo',
        if (stop['pickupTime'] != null) 'pickup ${stop['pickupTime']}',
        if (stop['dropTime'] != null) 'drop ${stop['dropTime']}',
        '$riders ${riders == 1 ? 'rider' : 'riders'}',
      ].join(' · '),
      trailing: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          AppIconButton(
            icon: Icons.edit_outlined,
            tooltip: 'Edit stop',
            onPressed: () => showAppFormSheet<void>(
              context,
              builder: (_) => _StopFormDialog(routeId: routeId, stop: stop),
            ),
          ),
          const SizedBox(width: AppSpacing.xs),
          AppIconButton(
            icon: Icons.delete_outlined,
            tone: removable ? Tone.bad : null,
            tooltip: removable ? 'Delete stop' : whyNot,
            onPressed: removable ? () => _delete(context, ref) : null,
          ),
        ],
      ),
    );
  }

  Future<void> _delete(BuildContext context, WidgetRef ref) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('Delete stop?'),
        content: Text('Remove ${stop['name']}?'),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.of(context).pop(true),
            child: const Text('Delete'),
          ),
        ],
      ),
    );
    if (confirmed != true) return;
    try {
      final api = ref.read(apiClientProvider);
      await api.delete('/transport/stops/${stop['id']}');
      ref.invalidate(transportOfficeRoutesProvider);
    } on ApiException catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(e.message)));
      }
    }
  }
}

class _RiderTile extends ConsumerWidget {
  const _RiderTile({required this.rider});

  final Map<String, dynamic> rider;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final student = rider['student'] as Map<String, dynamic>;
    final stop = rider['stop'] as Map<String, dynamic>?;
    final classLabel = [
      student['class'],
      student['section'],
    ].where((v) => v != null).join(' ');

    return AppListRow(
      title: student['name'] as String,
      subtitle: [
        if (classLabel.isNotEmpty) classLabel,
        if (stop != null) 'at ${stop['name']}',
        'since ${formatDay(rider['fromDate'] as String)}',
      ].join(' · '),
      trailing: AppIconButton(
        icon: Icons.person_remove_alt_1_outlined,
        tone: Tone.bad,
        tooltip: 'Remove from route',
        onPressed: () => _unboard(context, ref),
      ),
    );
  }

  Future<void> _unboard(BuildContext context, WidgetRef ref) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('Remove rider?'),
        content: Text('Take ${rider['student']['name']} off this route?'),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.of(context).pop(true),
            child: const Text('Remove'),
          ),
        ],
      ),
    );
    if (confirmed != true) return;
    try {
      final api = ref.read(apiClientProvider);
      await api.delete('/transport/board/${rider['studentTransportId']}');
      ref.invalidate(transportOfficeRoutesProvider);
    } on ApiException catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(e.message)));
      }
    }
  }
}

class _RouteFormDialog extends ConsumerStatefulWidget {
  const _RouteFormDialog({this.route});

  final Map<String, dynamic>? route;

  @override
  ConsumerState<_RouteFormDialog> createState() => _RouteFormDialogState();
}

class _RouteFormDialogState extends ConsumerState<_RouteFormDialog> {
  late final _name = TextEditingController(
    text: widget.route?['name'] as String? ?? '',
  );
  late final _vehicleNo = TextEditingController(
    text: widget.route?['vehicleNo'] as String? ?? '',
  );
  late final _driverName = TextEditingController(
    text: widget.route?['driverName'] as String? ?? '',
  );
  late final _driverPhone = TextEditingController(
    text: widget.route?['driverPhone'] as String? ?? '',
  );
  late final _attendantName = TextEditingController(
    text: widget.route?['attendantName'] as String? ?? '',
  );
  late final _capacity = TextEditingController(
    text: (widget.route?['capacity'] as int?)?.toString() ?? '',
  );
  bool _saving = false;
  String? _error;

  bool get _isEdit => widget.route != null;

  @override
  void dispose() {
    _name.dispose();
    _vehicleNo.dispose();
    _driverName.dispose();
    _driverPhone.dispose();
    _attendantName.dispose();
    _capacity.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      final api = ref.read(apiClientProvider);
      final body = {
        'name': _name.text.trim(),
        'vehicleNo': _vehicleNo.text.trim().isEmpty
            ? null
            : _vehicleNo.text.trim(),
        'driverName': _driverName.text.trim().isEmpty
            ? null
            : _driverName.text.trim(),
        'driverPhone': _driverPhone.text.trim().isEmpty
            ? null
            : _driverPhone.text.trim(),
        'attendantName': _attendantName.text.trim().isEmpty
            ? null
            : _attendantName.text.trim(),
        'capacity': int.tryParse(_capacity.text.trim()),
      };
      if (_isEdit) {
        await api.patch<Map<String, dynamic>>(
          '/transport/routes/${widget.route!['id']}',
          data: body,
        );
      } else {
        await api.post<Map<String, dynamic>>('/transport/routes', data: body);
      }
      ref.invalidate(transportOfficeRoutesProvider);
      if (mounted) Navigator.of(context).pop();
    } on ApiException catch (e) {
      setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return AppFormSheet(
      title: _isEdit ? 'Edit route' : 'Add route',
      actions: [
        OutlinedButton(
          onPressed: _saving ? null : () => Navigator.of(context).pop(),
          child: const Text('Cancel'),
        ),
        AppSubmitButton(label: 'Save', busy: _saving, onPressed: _submit),
      ],
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        mainAxisSize: MainAxisSize.min,
        children: [
          TextField(
            controller: _name,
            decoration: const InputDecoration(labelText: 'Route name'),
          ),
          const SizedBox(height: AppSpacing.md),
          TextField(
            controller: _vehicleNo,
            decoration: const InputDecoration(
              labelText: 'Vehicle no. (optional)',
            ),
          ),
          const SizedBox(height: AppSpacing.md),
          TextField(
            controller: _driverName,
            decoration: const InputDecoration(
              labelText: 'Driver name (optional)',
            ),
          ),
          const SizedBox(height: AppSpacing.md),
          TextField(
            controller: _driverPhone,
            keyboardType: TextInputType.phone,
            decoration: const InputDecoration(
              labelText: 'Driver phone (optional)',
            ),
          ),
          const SizedBox(height: AppSpacing.md),
          TextField(
            controller: _attendantName,
            decoration: const InputDecoration(
              labelText: 'Attendant name (optional)',
            ),
          ),
          const SizedBox(height: AppSpacing.md),
          TextField(
            controller: _capacity,
            keyboardType: TextInputType.number,
            decoration: const InputDecoration(
              labelText: 'Capacity, seats (optional)',
            ),
          ),
          if (_error != null) ...[
            const SizedBox(height: AppSpacing.lg),
            AppErrorBanner(_error!),
          ],
        ],
      ),
    );
  }
}

class _StopFormDialog extends ConsumerStatefulWidget {
  const _StopFormDialog({required this.routeId, this.stop});

  final String routeId;
  final Map<String, dynamic>? stop;

  @override
  ConsumerState<_StopFormDialog> createState() => _StopFormDialogState();
}

class _StopFormDialogState extends ConsumerState<_StopFormDialog> {
  late final _name = TextEditingController(
    text: widget.stop?['name'] as String? ?? '',
  );
  final _monthlyFeeText = TextEditingController();
  late final _pickupTime = TextEditingController(
    text: widget.stop?['pickupTime'] as String? ?? '',
  );
  late final _dropTime = TextEditingController(
    text: widget.stop?['dropTime'] as String? ?? '',
  );
  bool _saving = false;
  String? _error;

  bool get _isEdit => widget.stop != null;

  @override
  void dispose() {
    _name.dispose();
    _monthlyFeeText.dispose();
    _pickupTime.dispose();
    _dropTime.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      final api = ref.read(apiClientProvider);
      await api.post<Map<String, dynamic>>(
        '/transport/routes/${widget.routeId}/stops',
        data: {
          if (_isEdit) 'stopId': widget.stop!['id'],
          'name': _name.text.trim(),
          'monthlyFeeText': _monthlyFeeText.text.trim().isEmpty
              ? null
              : _monthlyFeeText.text.trim(),
          'pickupTime': _pickupTime.text.trim().isEmpty
              ? null
              : _pickupTime.text.trim(),
          'dropTime': _dropTime.text.trim().isEmpty
              ? null
              : _dropTime.text.trim(),
        },
      );
      ref.invalidate(transportOfficeRoutesProvider);
      if (mounted) Navigator.of(context).pop();
    } on ApiException catch (e) {
      setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return AppFormSheet(
      title: _isEdit ? 'Edit stop' : 'Add stop',
      actions: [
        OutlinedButton(
          onPressed: _saving ? null : () => Navigator.of(context).pop(),
          child: const Text('Cancel'),
        ),
        AppSubmitButton(label: 'Save', busy: _saving, onPressed: _submit),
      ],
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        mainAxisSize: MainAxisSize.min,
        children: [
          TextField(
            controller: _name,
            decoration: const InputDecoration(labelText: 'Stop name'),
          ),
          const SizedBox(height: AppSpacing.md),
          TextField(
            controller: _monthlyFeeText,
            decoration: InputDecoration(
              labelText:
                  'Monthly fee, e.g. 500${_isEdit ? '' : ' (optional, defaults to 0)'}',
            ),
          ),
          const SizedBox(height: AppSpacing.md),
          TextField(
            controller: _pickupTime,
            decoration: const InputDecoration(
              labelText: 'Pickup time, e.g. 07:30 (optional)',
            ),
          ),
          const SizedBox(height: AppSpacing.md),
          TextField(
            controller: _dropTime,
            decoration: const InputDecoration(
              labelText: 'Drop time, e.g. 14:45 (optional)',
            ),
          ),
          if (_error != null) ...[
            const SizedBox(height: AppSpacing.lg),
            AppErrorBanner(_error!),
          ],
        ],
      ),
    );
  }
}

/// Boards a student onto this route. There is no student-picker endpoint yet,
/// so this takes a raw student id — a rough edge until the mobile API exposes
/// a student search/lookup for office use.
class _BoardFormDialog extends ConsumerStatefulWidget {
  const _BoardFormDialog({required this.routeId, required this.stops});

  final String routeId;
  final List<Map<String, dynamic>> stops;

  @override
  ConsumerState<_BoardFormDialog> createState() => _BoardFormDialogState();
}

class _BoardFormDialogState extends ConsumerState<_BoardFormDialog> {
  final _studentId = TextEditingController();
  String? _stopId;
  final _fromIso = TextEditingController();
  bool _saving = false;
  String? _error;

  @override
  void dispose() {
    _studentId.dispose();
    _fromIso.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (_studentId.text.trim().isEmpty) {
      setState(() => _error = 'Enter the student\'s id.');
      return;
    }
    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      final api = ref.read(apiClientProvider);
      await api.post<Map<String, dynamic>>(
        '/transport/board',
        data: {
          'studentId': _studentId.text.trim(),
          'routeId': widget.routeId,
          'stopId': _stopId,
          'fromIso': _fromIso.text.trim().isEmpty ? null : _fromIso.text.trim(),
        },
      );
      ref.invalidate(transportOfficeRoutesProvider);
      if (mounted) Navigator.of(context).pop();
    } on ApiException catch (e) {
      setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return AppFormSheet(
      title: 'Board a student',
      actions: [
        OutlinedButton(
          onPressed: _saving ? null : () => Navigator.of(context).pop(),
          child: const Text('Cancel'),
        ),
        AppSubmitButton(label: 'Board', busy: _saving, onPressed: _submit),
      ],
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        mainAxisSize: MainAxisSize.min,
        children: [
          TextField(
            controller: _studentId,
            decoration: const InputDecoration(
              labelText: 'Student id',
              helperText: 'No student picker yet — paste the id from the student profile screen.',
            ),
          ),
          const SizedBox(height: AppSpacing.md),
          DropdownButtonFormField<String?>(
            initialValue: _stopId,
            decoration: const InputDecoration(labelText: 'Stop (optional)'),
            items: [
              const DropdownMenuItem<String?>(
                value: null,
                child: Text('No stop'),
              ),
              for (final stop in widget.stops)
                DropdownMenuItem<String?>(
                  value: stop['id'] as String,
                  child: Text(stop['name'] as String),
                ),
            ],
            onChanged: (value) => setState(() => _stopId = value),
          ),
          const SizedBox(height: AppSpacing.md),
          TextField(
            controller: _fromIso,
            decoration: const InputDecoration(
              labelText: 'From date, YYYY-MM-DD (optional)',
            ),
          ),
          if (_error != null) ...[
            const SizedBox(height: AppSpacing.lg),
            AppErrorBanner(_error!),
          ],
        ],
      ),
    );
  }
}
