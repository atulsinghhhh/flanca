import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/auth/auth_state.dart';
import '../../core/network/api_exception.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/app_widgets.dart';
import '../../core/format.dart';
import 'application_detail_screen.dart';

/// The vocabularies from prisma/schema.prisma's ApplicationStatus /
/// EnquiryStatus enums — used for filter chips and status dropdowns.
const applicationStatuses = [
  'SUBMITTED',
  'UNDER_REVIEW',
  'DOCUMENTS_PENDING',
  'SHORTLISTED',
  'OFFERED',
  'ENROLLED',
  'REJECTED',
  'WITHDRAWN',
];

const enquiryStatuses = ['NEW', 'CONTACTED', 'VISITED', 'CONVERTED', 'LOST'];

String applicationStatusLabel(String status) => status
    .split('_')
    .map((w) => '${w[0]}${w.substring(1).toLowerCase()}')
    .join(' ');

Tone applicationStatusTone(String status) => switch (status) {
  'ENROLLED' => Tone.good,
  'OFFERED' => Tone.good,
  'SHORTLISTED' => Tone.brand,
  'UNDER_REVIEW' => Tone.info,
  'DOCUMENTS_PENDING' => Tone.warn,
  'REJECTED' => Tone.bad,
  'WITHDRAWN' => Tone.neutral,
  _ => Tone.neutral,
};

String enquiryStatusLabel(String status) =>
    '${status[0]}${status.substring(1).toLowerCase()}';

Tone enquiryStatusTone(String status) => switch (status) {
  'CONVERTED' => Tone.good,
  'VISITED' => Tone.brand,
  'CONTACTED' => Tone.warn,
  'LOST' => Tone.bad,
  _ => Tone.info,
};

final _applicationsProvider = FutureProvider
    .family<List<Map<String, dynamic>>, String?>((ref, status) async {
      final api = ref.watch(apiClientProvider);
      final data = await api.get<Map<String, dynamic>>(
        '/admissions/applications',
        query: status == null ? null : {'status': status},
      );
      return (data['applications'] as List).cast<Map<String, dynamic>>();
    });

final _enquiriesProvider = FutureProvider
    .family<List<Map<String, dynamic>>, String?>((ref, status) async {
      final api = ref.watch(apiClientProvider);
      final data = await api.get<Map<String, dynamic>>(
        '/admissions/enquiries',
        query: status == null ? null : {'status': status},
      );
      return (data['enquiries'] as List).cast<Map<String, dynamic>>();
    });

/// Mirrors src/app/app/admissions/page.tsx: applications and enquiries review
/// in one place, each filterable by status.
class AdmissionsScreen extends StatelessWidget {
  const AdmissionsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return DefaultTabController(
      length: 2,
      child: Scaffold(
        appBar: const AppTopBar(
          title: 'Admissions',
          bottom: AppTabBar(tabs: ['Applications', 'Enquiries']),
        ),
        body: const TabBarView(children: [_ApplicationsTab(), _EnquiriesTab()]),
      ),
    );
  }
}

class _StatusFilterRow extends StatelessWidget {
  const _StatusFilterRow({
    required this.statuses,
    required this.value,
    required this.labelOf,
    required this.onChanged,
  });

  final List<String> statuses;
  final String? value;
  final String Function(String) labelOf;
  final ValueChanged<String?> onChanged;

  @override
  Widget build(BuildContext context) {
    return AppFilterBar(
      labels: ['All', for (final s in statuses) labelOf(s)],
      selectedIndex: value == null ? 0 : statuses.indexOf(value!) + 1,
      onSelected: (index) => onChanged(index == 0 ? null : statuses[index - 1]),
    );
  }
}

class _ApplicationsTab extends ConsumerStatefulWidget {
  const _ApplicationsTab();

  @override
  ConsumerState<_ApplicationsTab> createState() => _ApplicationsTabState();
}

class _ApplicationsTabState extends ConsumerState<_ApplicationsTab>
    with AutomaticKeepAliveClientMixin {
  String? _status;

  @override
  bool get wantKeepAlive => true;

  @override
  Widget build(BuildContext context) {
    super.build(context);
    final applications = ref.watch(_applicationsProvider(_status));

    return RefreshIndicator(
      onRefresh: () async => ref.invalidate(_applicationsProvider(_status)),
      child: Column(
        children: [
          const SizedBox(height: 12),
          _StatusFilterRow(
            statuses: applicationStatuses,
            value: _status,
            labelOf: applicationStatusLabel,
            onChanged: (v) => setState(() => _status = v),
          ),
          const SizedBox(height: 8),
          Expanded(
            child: applications.when(
              loading: () => const AppListSkeleton(),
              error: (err, _) => ErrorView(
                error: err,
                onRetry: () => ref.invalidate(_applicationsProvider(_status)),
              ),
              data: (rows) {
                if (rows.isEmpty) {
                  return const EmptyState(
                    icon: Icons.assignment_outlined,
                    title: 'No applications',
                    message: 'Applications with this status will appear here.',
                  );
                }
                return ListView.separated(
                  padding: const EdgeInsets.symmetric(vertical: 8),
                  itemCount: rows.length,
                  separatorBuilder: (_, _) => const Divider(
                    height: 1,
                    indent: AppSpacing.page,
                    endIndent: AppSpacing.page,
                  ),
                  itemBuilder: (context, index) {
                    final row = rows[index];
                    final status = row['status'] as String;
                    return AppListRow(
                      leading: AppAvatar(
                        name: row['studentName'] as String,
                        size: 40,
                        tone: applicationStatusTone(status),
                      ),
                      title: row['studentName'] as String,
                      subtitle:
                          '${row['applicationNo']} · ${row['classSought']}'
                          '${row['submittedAt'] != null ? ' · ${formatDay(row['submittedAt'] as String)}' : ''}',
                      trailing: ToneBadge(
                        applicationStatusLabel(status),
                        tone: applicationStatusTone(status),
                      ),
                      showChevron: true,
                      onTap: () async {
                        await Navigator.of(context).push(
                          MaterialPageRoute(
                            builder: (_) => ApplicationDetailScreen(
                              applicationId: row['id'] as String,
                            ),
                          ),
                        );
                        ref.invalidate(_applicationsProvider(_status));
                      },
                    );
                  },
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}

class _EnquiriesTab extends ConsumerStatefulWidget {
  const _EnquiriesTab();

  @override
  ConsumerState<_EnquiriesTab> createState() => _EnquiriesTabState();
}

class _EnquiriesTabState extends ConsumerState<_EnquiriesTab>
    with AutomaticKeepAliveClientMixin {
  String? _status;

  @override
  bool get wantKeepAlive => true;

  Future<void> _editEnquiry(Map<String, dynamic> enquiry) async {
    var status = enquiry['status'] as String;
    final notesController = TextEditingController(
      text: enquiry['notes'] as String? ?? '',
    );
    bool busy = false;

    await showAppFormSheet<void>(
      context,
      builder: (sheetContext) {
        return StatefulBuilder(
          builder: (sheetContext, setSheetState) {
            Future<void> submit() async {
              setSheetState(() => busy = true);
              try {
                final api = ref.read(apiClientProvider);
                await api.patch(
                  '/admissions/enquiries/${enquiry['id']}',
                  data: {'status': status, 'notes': notesController.text.trim()},
                );
                ref.invalidate(_enquiriesProvider(_status));
                if (sheetContext.mounted) Navigator.of(sheetContext).pop();
              } on ApiException catch (e) {
                if (sheetContext.mounted) {
                  ScaffoldMessenger.of(sheetContext).showSnackBar(SnackBar(content: Text(e.message)));
                }
              } finally {
                setSheetState(() => busy = false);
              }
            }

            return AppFormSheet(
              title: enquiry['studentName'] as String,
              subtitle: '${enquiry['classSought']} · ${enquiry['parentName']} · ${enquiry['phone']}',
              actions: [AppSubmitButton(label: 'Save', busy: busy, onPressed: submit)],
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  DropdownButtonFormField<String>(
                    initialValue: status,
                    decoration: const InputDecoration(labelText: 'Status'),
                    items: enquiryStatuses
                        .map((s) => DropdownMenuItem(value: s, child: Text(enquiryStatusLabel(s))))
                        .toList(),
                    onChanged: (v) => setSheetState(() => status = v!),
                  ),
                  const SizedBox(height: AppSpacing.md),
                  TextField(
                    controller: notesController,
                    decoration: const InputDecoration(labelText: 'Notes'),
                    maxLines: 3,
                  ),
                ],
              ),
            );
          },
        );
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    super.build(context);
    final enquiries = ref.watch(_enquiriesProvider(_status));

    return RefreshIndicator(
      onRefresh: () async => ref.invalidate(_enquiriesProvider(_status)),
      child: Column(
        children: [
          const SizedBox(height: 12),
          _StatusFilterRow(
            statuses: enquiryStatuses,
            value: _status,
            labelOf: enquiryStatusLabel,
            onChanged: (v) => setState(() => _status = v),
          ),
          const SizedBox(height: 8),
          Expanded(
            child: enquiries.when(
              loading: () => const AppListSkeleton(),
              error: (err, _) => ErrorView(
                error: err,
                onRetry: () => ref.invalidate(_enquiriesProvider(_status)),
              ),
              data: (rows) {
                if (rows.isEmpty) {
                  return const EmptyState(
                    icon: Icons.contact_mail_outlined,
                    title: 'No enquiries',
                    message: 'Enquiries with this status will appear here.',
                  );
                }
                return ListView.separated(
                  padding: const EdgeInsets.symmetric(vertical: 8),
                  itemCount: rows.length,
                  separatorBuilder: (_, _) => const Divider(
                    height: 1,
                    indent: AppSpacing.page,
                    endIndent: AppSpacing.page,
                  ),
                  itemBuilder: (context, index) {
                    final row = rows[index];
                    final status = row['status'] as String;
                    return AppListRow(
                      leading: AppAvatar(
                        name: row['studentName'] as String,
                        size: 40,
                        tone: enquiryStatusTone(status),
                      ),
                      title: row['studentName'] as String,
                      subtitle:
                          '${row['classSought']} · ${row['parentName']} · ${row['phone']}',
                      trailing: ToneBadge(
                        enquiryStatusLabel(status),
                        tone: enquiryStatusTone(status),
                      ),
                      onTap: () => _editEnquiry(row),
                    );
                  },
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}
