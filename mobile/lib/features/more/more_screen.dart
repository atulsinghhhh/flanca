import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/auth/auth_state.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/app_widgets.dart';
import '../attendance/staff_self_attendance_screen.dart';
import '../attendance/staff_attendance_screen.dart';
import '../fees/fees_screen.dart';
import '../fees/fees_office_screen.dart';
import '../fees/fee_structures_screen.dart';
import '../exams/report_cards_screen.dart';
import '../exams/report_card_analysis_screen.dart';
import '../notices/notices_screen.dart';
import '../ptm/ptm_screen.dart';
import '../calendar/calendar_screen.dart';
import '../transport/transport_screen.dart';
import '../transport/transport_office_screen.dart';
import '../tutor/tutor_screen.dart';
import '../staff/staff_list_screen.dart';
import '../staff/payroll_screen.dart';
import '../gate/gate_screen.dart';
import '../hostel/hostel_screen.dart';
import '../library/library_home_screen.dart';
import '../stock/stock_screen.dart';
import '../certificates/certificates_screen.dart';
import '../consent/consent_screen.dart';
import '../apaar/apaar_screen.dart';
import '../admissions/admissions_screen.dart';
import '../settings/settings_screen.dart';
import '../import/import_screen.dart';
import '../accounts/accounts_screen.dart';
import '../students/students_list_screen.dart';
import '../exams/exam_terms_screen.dart';

/// The fourth tab: everything that isn't a daily-use action lives here —
/// Tier-2 modules (fees, exams, students, notices, transport, …) as they
/// land, plus account/session controls.
///
/// Restructured from one long column of identical tile cards into two
/// registers: the handful of things opened every day become a tinted tile
/// grid at the top, and the module groups below stay as lists. A flat list of
/// twenty rows gives no clue which three matter today.
class MoreScreen extends ConsumerWidget {
  const MoreScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final actor = ref.watch(authControllerProvider).actor;
    final isFamily = actor?.hasAnyRole(['STUDENT', 'PARENT']) ?? false;
    final isOffice = actor?.isOffice ?? false;
    final isTeaching = actor?.isTeaching ?? false;
    final isMoney = actor?.isMoney ?? false;
    final isLibrary = actor?.isLibrary ?? false;

    void open(Widget screen) =>
        Navigator.of(context).push(MaterialPageRoute(builder: (_) => screen));

    return Scaffold(
      appBar: const AppTopBar(title: 'More'),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(
          AppSpacing.page,
          AppSpacing.xs,
          AppSpacing.page,
          AppSpacing.xxl,
        ),
        children: [
          const SectionHeader('Today'),
          const SizedBox(height: AppSpacing.md),
          _TileGrid(
            children: [
              if (isFamily) ...[
                AppActionCard(
                  icon: Icons.account_balance_wallet_outlined,
                  label: 'Fees',
                  tone: Tone.good,
                  onTap: () => open(const FeesScreen()),
                ),
                AppActionCard(
                  icon: Icons.school_outlined,
                  label: 'Report cards',
                  tone: Tone.info,
                  onTap: () => open(const ReportCardsScreen()),
                ),
                AppActionCard(
                  icon: Icons.directions_bus_outlined,
                  label: 'Transport',
                  tone: Tone.warn,
                  onTap: () => open(const TransportScreen()),
                ),
                AppActionCard(
                  icon: Icons.auto_awesome_outlined,
                  label: 'AI Tutor',
                  tone: Tone.brand,
                  onTap: () => open(const TutorScreen()),
                ),
              ],
              if (isTeaching)
                AppActionCard(
                  icon: Icons.how_to_reg_outlined,
                  label: 'My attendance',
                  tone: Tone.good,
                  onTap: () => open(const StaffSelfAttendanceScreen()),
                ),
              AppActionCard(
                icon: Icons.groups_outlined,
                label: 'Meetings',
                tone: Tone.brand,
                onTap: () => open(const PtmScreen()),
              ),
              AppActionCard(
                icon: Icons.campaign_outlined,
                label: 'Notices',
                tone: Tone.info,
                onTap: () => open(const NoticesScreen()),
              ),
              AppActionCard(
                icon: Icons.calendar_month_outlined,
                label: 'Calendar',
                tone: Tone.warn,
                onTap: () => open(const CalendarScreen()),
              ),
            ],
          ),
          // Mirrors src/components/shell/nav.tsx's GROUPS — Academics / Students /
          // Money / Compliance / School / Setup — so the module list reads the
          // same way here as it does on the web sidebar, instead of one flat list.
          if (isTeaching)
            _Group(title: 'Academics', tiles: [
              AppTileSpec(
                Icons.fact_check_outlined,
                'Exams & marks',
                () => open(const ExamTermsScreen()),
              ),
              AppTileSpec(
                Icons.school_outlined,
                'Report cards',
                () => open(const ReportCardTermsScreen()),
              ),
            ]),
          if (isOffice)
            _Group(title: 'Students', tiles: [
              AppTileSpec(
                Icons.groups_outlined,
                'Students',
                () => open(const StudentsListScreen()),
              ),
              AppTileSpec(
                Icons.how_to_reg_outlined,
                'Admissions',
                () => open(const AdmissionsScreen()),
              ),
              AppTileSpec(
                Icons.workspace_premium_outlined,
                'Certificates',
                () => open(const CertificatesScreen()),
              ),
            ]),
          if (isMoney)
            _Group(title: 'Money', tiles: [
              AppTileSpec(
                Icons.receipt_long_outlined,
                'Fee collection',
                () => open(const FeesOfficeScreen()),
              ),
              AppTileSpec(
                Icons.table_chart_outlined,
                'Fee structure',
                () => open(const FeeStructuresScreen()),
              ),
              AppTileSpec(
                Icons.point_of_sale_outlined,
                'Accounts',
                () => open(const AccountsScreen()),
              ),
            ]),
          if (isOffice)
            _Group(title: 'Compliance', tiles: [
              AppTileSpec(
                Icons.fingerprint_rounded,
                'APAAR centre',
                () => open(const ApaarScreen()),
              ),
              AppTileSpec(
                Icons.privacy_tip_outlined,
                'Consent register',
                () => open(const ConsentScreen()),
              ),
            ]),
          if (isOffice || isLibrary)
            _Group(title: 'School', tiles: [
              if (isOffice) ...[
                AppTileSpec(
                  Icons.badge_outlined,
                  'Staff',
                  () => open(const StaffListScreen()),
                ),
                AppTileSpec(
                  Icons.currency_rupee_rounded,
                  'Payroll',
                  () => open(const PayrollScreen()),
                ),
                AppTileSpec(
                  Icons.event_available_outlined,
                  'Staff attendance',
                  () => open(const StaffAttendanceScreen()),
                ),
              ],
              if (isLibrary)
                AppTileSpec(
                  Icons.local_library_outlined,
                  'Library',
                  () => open(const LibraryHomeScreen()),
                ),
              if (isOffice) ...[
                AppTileSpec(
                  Icons.directions_bus_outlined,
                  'Transport routes',
                  () => open(const TransportOfficeScreen()),
                ),
                AppTileSpec(
                  Icons.hotel_outlined,
                  'Hostel',
                  () => open(const HostelScreen()),
                ),
                AppTileSpec(
                  Icons.inventory_2_outlined,
                  'Stock',
                  () => open(const StockScreen()),
                ),
                AppTileSpec(
                  Icons.shield_outlined,
                  'Gate',
                  () => open(const GateScreen()),
                ),
              ],
            ]),
          if (isOffice)
            _Group(title: 'Setup', tiles: [
              AppTileSpec(
                Icons.upload_file_outlined,
                'Import data',
                () => open(const ImportScreen()),
              ),
              AppTileSpec(
                Icons.settings_outlined,
                'Settings',
                () => open(const SettingsScreen()),
              ),
            ]),
        ],
      ),
    );
  }
}

/// One titled module group, with the gap above it baked in — every group on
/// this screen was hand-spacing its own `SizedBox(height: 24)` and they had
/// begun to drift.
///
/// Groups render as the same tinted tile grid "Today" uses, so the whole
/// screen is one register instead of a grid followed by six list panels.
class _Group extends StatelessWidget {
  const _Group({required this.title, required this.tiles});

  final String title;
  final List<AppTileSpec> tiles;

  /// The tile tints cycle through the four tones in a fixed order rather than
  /// being picked per module — it keeps a six-tile group readable as a group
  /// while still letting the eye land on a specific tile.
  static const _cycle = [Tone.brand, Tone.info, Tone.warn, Tone.good];

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(top: AppSpacing.xl),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SectionHeader(title),
          const SizedBox(height: AppSpacing.md),
          _TileGrid(
            children: [
              for (var i = 0; i < tiles.length; i++)
                AppActionCard(
                  icon: tiles[i].icon,
                  label: tiles[i].label,
                  tone: tiles[i].tone ?? _cycle[i % _cycle.length],
                  onTap: tiles[i].onTap,
                ),
            ],
          ),
        ],
      ),
    );
  }
}

/// The daily-use grid. Same responsive column rule as Home's quick actions, so
/// the two tab screens line up tile-for-tile when placed side by side on a
/// tablet.
class _TileGrid extends StatelessWidget {
  const _TileGrid({required this.children});

  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    final scale = MediaQuery.textScalerOf(context).scale(14.5) / 14.5;
    final extent = (124 + (scale - 1) * 56).clamp(124.0, 216.0);

    return LayoutBuilder(
      builder: (context, constraints) {
        final width = constraints.maxWidth;
        final columns = width >= 900
            ? 5
            : width >= 700
                ? 4
                : width >= 480
                    ? 3
                    : 2;

        return GridView.builder(
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          padding: EdgeInsets.zero,
          itemCount: children.length,
          gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
            crossAxisCount: columns,
            mainAxisSpacing: AppSpacing.md,
            crossAxisSpacing: AppSpacing.md,
            mainAxisExtent: extent,
          ),
          itemBuilder: (context, index) => AppFadeIn(
            delay: AppFadeIn.stagger(index),
            child: children[index],
          ),
        );
      },
    );
  }
}
