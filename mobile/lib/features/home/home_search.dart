import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/auth/auth_state.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/app_widgets.dart';
import '../../models/actor.dart';
import '../accounts/accounts_screen.dart';
import '../admissions/admissions_screen.dart';
import '../apaar/apaar_screen.dart';
import '../attendance/attendance_status_screen.dart';
import '../attendance/my_attendance_screen.dart';
import '../attendance/staff_attendance_screen.dart';
import '../attendance/staff_self_attendance_screen.dart';
import '../calendar/calendar_screen.dart';
import '../certificates/certificates_screen.dart';
import '../consent/consent_screen.dart';
import '../exams/exam_terms_screen.dart';
import '../exams/report_card_analysis_screen.dart';
import '../exams/report_cards_screen.dart';
import '../fees/fee_structures_screen.dart';
import '../fees/fees_office_screen.dart';
import '../fees/fees_screen.dart';
import '../gate/gate_screen.dart';
import '../homework/homework_list_screen.dart';
import '../hostel/hostel_screen.dart';
import '../import/import_screen.dart';
import '../library/library_home_screen.dart';
import '../notices/notices_screen.dart';
import '../ptm/ptm_screen.dart';
import '../settings/settings_screen.dart';
import '../staff/payroll_screen.dart';
import '../staff/staff_detail_screen.dart';
import '../staff/staff_list_screen.dart';
import '../stock/stock_screen.dart';
import '../students/student_detail_screen.dart';
import '../students/students_list_screen.dart';
import '../timetable/my_timetable_screen.dart';
import '../timetable/timetable_screen.dart';
import '../transport/transport_office_screen.dart';
import '../transport/transport_screen.dart';
import '../tutor/tutor_screen.dart';

typedef _RoleFlags = ({
  bool isOffice,
  bool isTeaching,
  bool isMoney,
  bool isLibrary,
  bool isFamily,
});

_RoleFlags _flagsFor(Actor? actor) => (
  isOffice: actor?.isOffice ?? false,
  isTeaching: actor?.isTeaching ?? false,
  isMoney: actor?.isMoney ?? false,
  isLibrary: actor?.isLibrary ?? false,
  isFamily: actor?.hasAnyRole(['STUDENT', 'PARENT']) ?? false,
);

class _ScreenEntry {
  const _ScreenEntry(this.label, this.icon, this.visible, this.builder);

  final String label;
  final IconData icon;
  final bool Function(_RoleFlags flags) visible;
  final Widget Function() builder;
}

/// Every screen this app has a route to, one entry each — the same set More
/// (more_screen.dart) and Home's own quick actions (home_screen.dart) build
/// their tiles from, just flattened into one searchable directory instead of
/// scattered across groups. A screen's visibility rule here is copied from
/// wherever that tile is gated in those two files, so "can I see the tile"
/// and "can I find it by typing its name" never disagree.
final _screenEntries = <_ScreenEntry>[
  _ScreenEntry(
    'Fees',
    Icons.account_balance_wallet_outlined,
    (f) => f.isFamily,
    () => const FeesScreen(),
  ),
  _ScreenEntry(
    'My attendance',
    Icons.fact_check_outlined,
    (f) => f.isFamily,
    () => const MyAttendanceScreen(),
  ),
  _ScreenEntry(
    'My timetable',
    Icons.grid_view_outlined,
    (f) => f.isFamily,
    () => const MyTimetableScreen(),
  ),
  _ScreenEntry(
    'Report cards',
    Icons.school_outlined,
    (f) => f.isFamily,
    () => const ReportCardsScreen(),
  ),
  _ScreenEntry(
    'Transport',
    Icons.directions_bus_outlined,
    (f) => f.isFamily,
    () => const TransportScreen(),
  ),
  _ScreenEntry(
    'AI Tutor',
    Icons.auto_awesome_outlined,
    (f) => f.isFamily,
    () => const TutorScreen(),
  ),
  _ScreenEntry(
    'Attendance',
    Icons.fact_check_outlined,
    (f) => !f.isFamily,
    () => const AttendanceStatusScreen(),
  ),
  _ScreenEntry(
    'Timetable',
    Icons.grid_view_outlined,
    (f) => !f.isFamily,
    () => const TimetableScreen(),
  ),
  _ScreenEntry(
    'Homework',
    Icons.menu_book_outlined,
    (f) => true,
    () => const HomeworkListScreen(),
  ),
  _ScreenEntry(
    'Meetings',
    Icons.groups_outlined,
    (f) => true,
    () => const PtmScreen(),
  ),
  _ScreenEntry(
    'Notices',
    Icons.campaign_outlined,
    (f) => true,
    () => const NoticesScreen(),
  ),
  _ScreenEntry(
    'Calendar',
    Icons.calendar_month_outlined,
    (f) => true,
    () => const CalendarScreen(),
  ),
  _ScreenEntry(
    'Mark my attendance',
    Icons.how_to_reg_outlined,
    (f) => f.isTeaching,
    () => const StaffSelfAttendanceScreen(),
  ),
  _ScreenEntry(
    'Exams & marks',
    Icons.fact_check_outlined,
    (f) => f.isTeaching,
    () => const ExamTermsScreen(),
  ),
  _ScreenEntry(
    'Report cards (staff)',
    Icons.school_outlined,
    (f) => f.isTeaching,
    () => const ReportCardTermsScreen(),
  ),
  _ScreenEntry(
    'Students',
    Icons.groups_outlined,
    (f) => f.isOffice,
    () => const StudentsListScreen(),
  ),
  _ScreenEntry(
    'Admissions',
    Icons.how_to_reg_outlined,
    (f) => f.isOffice,
    () => const AdmissionsScreen(),
  ),
  _ScreenEntry(
    'Certificates',
    Icons.workspace_premium_outlined,
    (f) => f.isOffice,
    () => const CertificatesScreen(),
  ),
  _ScreenEntry(
    'Fee collection',
    Icons.receipt_long_outlined,
    (f) => f.isMoney,
    () => const FeesOfficeScreen(),
  ),
  _ScreenEntry(
    'Fee structure',
    Icons.table_chart_outlined,
    (f) => f.isMoney,
    () => const FeeStructuresScreen(),
  ),
  _ScreenEntry(
    'Accounts',
    Icons.point_of_sale_outlined,
    (f) => f.isMoney,
    () => const AccountsScreen(),
  ),
  _ScreenEntry(
    'APAAR centre',
    Icons.fingerprint_rounded,
    (f) => f.isOffice,
    () => const ApaarScreen(),
  ),
  _ScreenEntry(
    'Consent register',
    Icons.privacy_tip_outlined,
    (f) => f.isOffice,
    () => const ConsentScreen(),
  ),
  _ScreenEntry(
    'Staff',
    Icons.badge_outlined,
    (f) => f.isOffice,
    () => const StaffListScreen(),
  ),
  _ScreenEntry(
    'Payroll',
    Icons.currency_rupee_rounded,
    (f) => f.isOffice,
    () => const PayrollScreen(),
  ),
  _ScreenEntry(
    'Staff attendance',
    Icons.event_available_outlined,
    (f) => f.isOffice,
    () => const StaffAttendanceScreen(),
  ),
  _ScreenEntry(
    'Library',
    Icons.local_library_outlined,
    (f) => f.isLibrary,
    () => const LibraryHomeScreen(),
  ),
  _ScreenEntry(
    'Transport routes',
    Icons.directions_bus_outlined,
    (f) => f.isOffice,
    () => const TransportOfficeScreen(),
  ),
  _ScreenEntry(
    'Hostel',
    Icons.hotel_outlined,
    (f) => f.isOffice,
    () => const HostelScreen(),
  ),
  _ScreenEntry(
    'Stock',
    Icons.inventory_2_outlined,
    (f) => f.isOffice,
    () => const StockScreen(),
  ),
  _ScreenEntry(
    'Gate',
    Icons.shield_outlined,
    (f) => f.isOffice,
    () => const GateScreen(),
  ),
  _ScreenEntry(
    'Import data',
    Icons.upload_file_outlined,
    (f) => f.isOffice,
    () => const ImportScreen(),
  ),
  _ScreenEntry(
    'Settings',
    Icons.settings_outlined,
    (f) => f.isOffice,
    () => const SettingsScreen(),
  ),
];

enum _Category { all, screens, students, staff }

/// A quick jump from Home into anything in the app — a screen by name, a
/// student, or (for office roles) a staff member — in one search box instead
/// of three. Students and staff results reuse the same `?q=` search the full
/// roster screens use (students_list_screen.dart, staff_list_screen.dart);
/// screens are matched against the same static directory More's tiles come
/// from, so nothing here can find a screen a role couldn't otherwise reach.
class HomeGlobalSearch extends ConsumerStatefulWidget {
  const HomeGlobalSearch({super.key});

  @override
  ConsumerState<HomeGlobalSearch> createState() => _HomeGlobalSearchState();
}

class _HomeGlobalSearchState extends ConsumerState<HomeGlobalSearch> {
  final _controller = TextEditingController();
  Timer? _debounce;
  String _query = '';
  _Category _category = _Category.all;

  @override
  void dispose() {
    _debounce?.cancel();
    _controller.dispose();
    super.dispose();
  }

  void _onChanged(String value) {
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 350), () {
      if (mounted) setState(() => _query = value.trim());
    });
  }

  void _clear() {
    _debounce?.cancel();
    _controller.clear();
    setState(() {
      _query = '';
      _category = _Category.all;
    });
  }

  @override
  Widget build(BuildContext context) {
    final flags = _flagsFor(ref.watch(authControllerProvider).actor);
    // Two characters before hitting the API — one letter of a common name
    // matches half the roll and is not a useful result set. Screens match
    // instantly since that list is already in memory.
    final searching = _query.length >= 2;

    final categories = [
      _Category.all,
      _Category.screens,
      if (flags.isOffice || flags.isTeaching) _Category.students,
      if (flags.isOffice) _Category.staff,
    ];
    if (!categories.contains(_category)) _category = _Category.all;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // The shared pill field, which already drives its own clear button off
        // the controller — so the affordance appears as you type rather than
        // 350ms later when the debounce fires.
        AppSearchField(
          controller: _controller,
          hintText: 'Search students, staff or a screen',
          onChanged: _onChanged,
          textInputAction: TextInputAction.search,
        ),
        if (searching && categories.length > 2) ...[
          const SizedBox(height: AppSpacing.sm),
          AppFilterBar(
            labels: [for (final c in categories) _categoryLabel(c)],
            selectedIndex: categories.indexOf(_category),
            onSelected: (index) =>
                setState(() => _category = categories[index]),
            padding: EdgeInsets.zero,
          ),
        ],
        if (searching) ...[
          const SizedBox(height: AppSpacing.sm),
          _HomeSearchResults(
            query: _query,
            category: _category,
            flags: flags,
            onPicked: _clear,
          ),
        ],
      ],
    );
  }
}

String _categoryLabel(_Category c) => switch (c) {
  _Category.all => 'All',
  _Category.screens => 'Screens',
  _Category.students => 'Students',
  _Category.staff => 'Staff',
};

class _HomeSearchResults extends ConsumerWidget {
  const _HomeSearchResults({
    required this.query,
    required this.category,
    required this.flags,
    required this.onPicked,
  });

  final String query;
  final _Category category;
  final _RoleFlags flags;
  final VoidCallback onPicked;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final q = query.toLowerCase();
    final matchedScreens =
        category == _Category.all || category == _Category.screens
        ? _screenEntries
              .where(
                (e) => e.visible(flags) && e.label.toLowerCase().contains(q),
              )
              .take(6)
              .toList()
        : const <_ScreenEntry>[];

    final sections = <Widget>[];

    if (matchedScreens.isNotEmpty) {
      sections.add(
        _ResultSection(
          title: 'Screens',
          child: Column(
            children: [
              for (var i = 0; i < matchedScreens.length; i++) ...[
                _ScreenResultRow(entry: matchedScreens[i], onPicked: onPicked),
                if (i < matchedScreens.length - 1)
                  const Divider(
                    height: 1,
                    indent: AppTile.dividerIndent,
                    endIndent: AppSpacing.lg,
                  ),
              ],
            ],
          ),
        ),
      );
    }

    if ((category == _Category.all || category == _Category.students) &&
        (flags.isOffice || flags.isTeaching)) {
      sections.add(
        _ResultSection(
          title: 'Students',
          child: Consumer(
            builder: (context, ref, _) {
              final result = ref.watch(
                studentsListProvider(StudentsQuery(q: query)),
              );
              return result.when(
                loading: () => const AppInlineLoader(height: 44),
                error: (_, _) => const SizedBox.shrink(),
                data: (data) {
                  final rows = (data['rows'] as List? ?? [])
                      .cast<Map<String, dynamic>>()
                      .take(6)
                      .toList();
                  if (rows.isEmpty) return const _NoMatches();
                  return Column(
                    children: [
                      for (var i = 0; i < rows.length; i++) ...[
                        _StudentResultRow(row: rows[i], onPicked: onPicked),
                        if (i < rows.length - 1)
                          const Divider(
                            height: 1,
                            indent: AppTile.dividerIndent,
                            endIndent: AppSpacing.lg,
                          ),
                      ],
                    ],
                  );
                },
              );
            },
          ),
        ),
      );
    }

    if ((category == _Category.all || category == _Category.staff) &&
        flags.isOffice) {
      sections.add(
        _ResultSection(
          title: 'Staff',
          child: Consumer(
            builder: (context, ref, _) {
              final result = ref.watch(staffListProvider(StaffQuery(q: query)));
              return result.when(
                loading: () => const AppInlineLoader(height: 44),
                error: (_, _) => const SizedBox.shrink(),
                data: (data) {
                  final rows = (data['staff'] as List? ?? [])
                      .cast<Map<String, dynamic>>()
                      .take(6)
                      .toList();
                  if (rows.isEmpty) return const _NoMatches();
                  return Column(
                    children: [
                      for (var i = 0; i < rows.length; i++) ...[
                        _StaffResultRow(row: rows[i], onPicked: onPicked),
                        if (i < rows.length - 1)
                          const Divider(
                            height: 1,
                            indent: AppTile.dividerIndent,
                            endIndent: AppSpacing.lg,
                          ),
                      ],
                    ],
                  );
                },
              );
            },
          ),
        ),
      );
    }

    if (sections.isEmpty) {
      return const AppBanner(
        message: 'Nothing matches.',
        tone: Tone.neutral,
        icon: Icons.search_off_outlined,
      );
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        for (var i = 0; i < sections.length; i++) ...[
          if (i > 0) const SizedBox(height: AppSpacing.md),
          sections[i],
        ],
      ],
    );
  }
}

class _NoMatches extends StatelessWidget {
  const _NoMatches();

  @override
  Widget build(BuildContext context) {
    return const Padding(
      padding: EdgeInsets.all(AppSpacing.sm),
      child: AppBanner(message: 'No matches.', tone: Tone.neutral),
    );
  }
}

/// A titled group of result rows in one surface, so "Screens" / "Students" /
/// "Staff" read as three answers to one search rather than one long list.
class _ResultSection extends StatelessWidget {
  const _ResultSection({required this.title, required this.child});

  final String title;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.only(
            left: AppSpacing.lg,
            bottom: AppSpacing.xs,
          ),
          child: Eyebrow(title),
        ),
        AppSurface(clip: true, child: child),
      ],
    );
  }
}

class _ScreenResultRow extends StatelessWidget {
  const _ScreenResultRow({required this.entry, required this.onPicked});

  final _ScreenEntry entry;
  final VoidCallback onPicked;

  @override
  Widget build(BuildContext context) {
    return AppListRow(
      icon: entry.icon,
      title: entry.label,
      showChevron: true,
      onTap: () {
        FocusScope.of(context).unfocus();
        onPicked();
        Navigator.of(context)
            .push(MaterialPageRoute(builder: (_) => entry.builder()));
      },
    );
  }
}

class _StudentResultRow extends StatelessWidget {
  const _StudentResultRow({required this.row, required this.onPicked});

  final Map<String, dynamic> row;
  final VoidCallback onPicked;

  @override
  Widget build(BuildContext context) {
    final className = (row['class'] as Map?)?['name'] as String? ?? '—';
    final sectionName = (row['section'] as Map?)?['name'] as String?;
    final name = row['name'] as String? ?? '';

    return AppListRow(
      // Matches the roster rows on the full students screen, so a result
      // here and the same student there read as the same object.
      leading: AppAvatar(name: name, size: 40, tone: Tone.neutral),
      title: name,
      subtitle: '$className${sectionName != null ? ' $sectionName' : ''}',
      showChevron: true,
      onTap: () {
        FocusScope.of(context).unfocus();
        onPicked();
        Navigator.of(context).push(
          MaterialPageRoute(
            builder: (_) => StudentDetailScreen(studentId: row['id'] as String),
          ),
        );
      },
    );
  }
}

class _StaffResultRow extends StatelessWidget {
  const _StaffResultRow({required this.row, required this.onPicked});

  final Map<String, dynamic> row;
  final VoidCallback onPicked;

  @override
  Widget build(BuildContext context) {
    final name = row['name'] as String? ?? '';
    final subtitle = [
      row['designation'] as String?,
      row['department'] as String?,
    ].whereType<String>().where((s) => s.isNotEmpty).join(' · ');

    return AppListRow(
      leading: AppAvatar(name: name, size: 40, tone: Tone.info),
      title: name,
      subtitle: subtitle,
      showChevron: true,
      onTap: () {
        FocusScope.of(context).unfocus();
        onPicked();
        Navigator.of(context).push(
          MaterialPageRoute(
            builder: (_) =>
                StaffDetailScreen(staffId: row['staffId'] as String),
          ),
        );
      },
    );
  }
}
