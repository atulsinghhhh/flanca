import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/auth/auth_state.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/app_widgets.dart';

final transportProvider = FutureProvider.autoDispose((ref) async {
  final api = ref.watch(apiClientProvider);
  return api.get<Map<String, dynamic>>('/transport/me');
});

/// "Which bus is my child on" — mirrors the read side of
/// src/app/app/transport/page.tsx. Route/stop setup stays office-only.
class TransportScreen extends ConsumerWidget {
  const TransportScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final result = ref.watch(transportProvider);

    return Scaffold(
      appBar: AppTopBar(title: 'Transport'),
      body: RefreshIndicator(
        onRefresh: () async => ref.invalidate(transportProvider),
        child: result.when(
          loading: () => const AppCardsSkeleton(cards: 2),
          error: (err, _) => ErrorView(error: err, onRetry: () => ref.invalidate(transportProvider)),
          data: (data) {
            final children = data['children'] as List?;
            final entries = children != null
                ? children.cast<Map<String, dynamic>>()
                : [
                    {'student': data['student'], 'transport': data['transport']},
                  ];

            return ListView.builder(
              padding: const EdgeInsets.all(AppSpacing.ml),
              itemCount: entries.length,
              itemBuilder: (context, index) => _ChildTransport(entry: entries[index]),
            );
          },
        ),
      ),
    );
  }
}

class _ChildTransport extends StatelessWidget {
  const _ChildTransport({required this.entry});

  final Map<String, dynamic> entry;

  @override
  Widget build(BuildContext context) {
    final student = entry['student'] as Map<String, dynamic>?;
    final transport = entry['transport'] as Map<String, dynamic>?;
    if (student == null) return const SizedBox.shrink();

    return Padding(
      padding: const EdgeInsets.only(bottom: AppSpacing.lg),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              AppAvatar(name: student['name'] as String? ?? '', size: 40),
              const SizedBox(width: AppSpacing.sm + 2),
              Expanded(
                child: Text(
                  student['name'] as String? ?? '',
                  style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15.5),
                ),
              ),
            ],
          ),
          const SizedBox(height: AppSpacing.md),
          if (transport == null)
            const AppBanner(
              tone: Tone.neutral,
              icon: Icons.directions_bus_outlined,
              message: 'Not on a transport route.',
            )
          else
            _TransportDetail(transport: transport),
        ],
      ),
    );
  }
}

class _TransportDetail extends StatelessWidget {
  const _TransportDetail({required this.transport});

  final Map<String, dynamic> transport;

  @override
  Widget build(BuildContext context) {
    final route = transport['route'] as Map<String, dynamic>?;
    final stop = transport['stop'] as Map<String, dynamic>?;

    final rows = <AppKeyValue>[
      if (route != null) ...[
        AppKeyValue(
          label: 'Route',
          value: route['name'] as String? ?? '—',
          valueWidget: route['vehicleNo'] != null
              ? ToneBadge(route['vehicleNo'] as String, tone: Tone.neutral)
              : null,
        ),
        if (route['driverName'] != null)
          AppKeyValue(
            label: 'Driver',
            value: '${route['driverName']}${route['driverPhone'] != null ? ' · ${route['driverPhone']}' : ''}',
          ),
        if (route['attendantName'] != null)
          AppKeyValue(label: 'Attendant', value: route['attendantName'] as String),
      ],
      if (stop != null) ...[
        AppKeyValue(label: 'Stop', value: stop['name'] as String? ?? '—'),
        if (stop['pickupTime'] != null || stop['dropTime'] != null)
          AppKeyValue(
            label: 'Timing',
            value: [
              if (stop['pickupTime'] != null) 'Pickup ${stop['pickupTime']}',
              if (stop['dropTime'] != null) 'Drop ${stop['dropTime']}',
            ].join(' · '),
          ),
      ],
    ];

    return AppKeyValueGroup(rows: rows);
  }
}
