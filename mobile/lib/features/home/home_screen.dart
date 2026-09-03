import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/auth/auth_state.dart';
import '../../core/format.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/app_widgets.dart';
import '../attendance/attendance_status_screen.dart';
import '../attendance/my_attendance_screen.dart';
import '../homework/homework_list_screen.dart';
import '../timetable/timetable_screen.dart';
import '../timetable/my_timetable_screen.dart';
import '../timetable/class_timetable_screen.dart';
import '../timetable/school_timetable_screen.dart';
import '../ptm/ptm_screen.dart';
import '../notifications/notifications_screen.dart';
import '../profile/profile_screen.dart' show staffMeProvider;
import '../fees/fees_screen.dart';
import '../fees/fees_office_screen.dart';
import '../staff/staff_list_screen.dart';
import '../admissions/admissions_screen.dart';
import '../notices/notices_screen.dart';
import 'home_search.dart';

final homeDataProvider = FutureProvider((ref) async {
  final api = ref.watch(apiClientProvider);
  return api.get<Map<String, dynamic>>('/home');
});

/// Same cheap count the web header's bell polls on every page load
/// (src/app/app/layout.tsx) — one indexed `count()`, not the notification list.
final unreadNotificationsProvider = FutureProvider((ref) async {
  final api = ref.watch(apiClientProvider);
  final data = await api.get<Map<String, dynamic>>(
    '/notifications/unread-count',
  );
  return data['count'] as int? ?? 0;
});

/// The dashboard tab: an identity header, an at-a-glance summary pulled from
/// /home, and quick-launch cards for the daily-use modules. Mirrors the spirit
/// of src/app/app/page.tsx's "one entry point, four different homes" without
/// trying to replicate its office-dashboard density on a phone screen.
class HomeScreen extends ConsumerWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final auth = ref.watch(authControllerProvider);
    final actor = auth.actor;
    final home = ref.watch(homeDataProvider);

    return Scaffold(
      body: SafeArea(
        bottom: false,
        child: RefreshIndicator(
          onRefresh: () async => ref.invalidate(homeDataProvider),
          color: AppColors.brand,
          backgroundColor: AppColors.card,
          child: CustomScrollView(
            // Always scrollable so pull-to-refresh still works on the short
            // loading and error states, not just once a full dashboard's
            // worth of content is on screen.
            physics: const AlwaysScrollableScrollPhysics(),
            slivers: [
              const SliverToBoxAdapter(child: _Header()),
              SliverPadding(
                padding: const EdgeInsets.fromLTRB(
                  AppSpacing.page,
                  AppSpacing.ml,
                  AppSpacing.page,
                  AppSpacing.xl,
                ),
                sliver: SliverToBoxAdapter(
                  child: home.when(
                    loading: () => const _DashboardSkeleton(),
                    error: (err, _) => ErrorView(
                      error: err,
                      onRetry: () => ref.invalidate(homeDataProvider),
                    ),
                    data: (data) => AppFadeIn(
                      child: _DashboardBody(
                        data: data,
                        isTeaching: actor?.isTeaching ?? false,
                        isFamily:
                            actor?.hasAnyRole(['STUDENT', 'PARENT']) ?? false,
                        isOffice: actor?.isOffice ?? false,
                      ),
                    ),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Today, as "Tuesday · 2 Sep 2026". Presentation only — nothing on this
/// screen keys off it; it exists so the header's kicker says something true
/// about right now instead of repeating the product name back at the user.
String _todayLabel() {
  const days = [
    'Monday',
    'Tuesday',
    'Wednesday',
    'Thursday',
    'Friday',
    'Saturday',
    'Sunday',
  ];
  final now = DateTime.now();
  return '${days[now.weekday - 1]} · ${formatDay(now.toIso8601String())}';
}

/// The screen's identity block. The signed-in person's own name is the
/// headline — it is the one thing here that says whose dashboard this is.
///
/// Rebuilt as a proper hero row: the avatar anchors the left edge, today's
/// date takes the kicker slot the product name used to waste, and the bell
/// became a real circular control with a count rather than a bare glyph.
class _Header extends ConsumerWidget {
  const _Header();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final name = ref.watch(authControllerProvider).actor?.name ?? '';
    final unread = ref
        .watch(unreadNotificationsProvider)
        .maybeWhen(data: (c) => c, orElse: () => 0);

    return Padding(
      padding: const EdgeInsets.fromLTRB(
        AppSpacing.page,
        AppSpacing.md,
        AppSpacing.page,
        0,
      ),
      child: Row(
        children: [
          if (name.isNotEmpty) ...[
            AppAvatar(name: name, size: 48),
            const SizedBox(width: AppSpacing.md + 2),
          ],
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Eyebrow(_todayLabel()),
                if (name.isNotEmpty) ...[
                  const SizedBox(height: 3),
                  Text(
                    name,
                    style: Theme.of(context).textTheme.headlineSmall,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                ],
              ],
            ),
          ),
          const SizedBox(width: AppSpacing.sm),
          AppIconButton(
            icon: Icons.notifications_none_rounded,
            tooltip: 'Notifications',
            badgeCount: unread,
            iconSize: 22,
            onPressed: () => Navigator.of(context).push(
              MaterialPageRoute(builder: (_) => const NotificationsScreen()),
            ),
          ),
        ],
      ),
    );
  }
}

/// A stand-in shaped like the real dashboard — chip row, section label, and
/// the quick-action grid — so the layout doesn't jump when /home resolves.
class _DashboardSkeleton extends StatelessWidget {
  const _DashboardSkeleton();

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: const [
            AppSkeletonBox(width: 148, height: 36, radius: AppRadius.pill),
            SizedBox(width: AppSpacing.sm),
            AppSkeletonBox(width: 104, height: 36, radius: AppRadius.pill),
          ],
        ),
        const SizedBox(height: AppSpacing.xl),
        const AppSkeletonBox(width: 120, height: 14),
        const SizedBox(height: AppSpacing.md),
        LayoutBuilder(
          builder: (context, constraints) {
            final columns = _quickActionColumns(constraints.maxWidth);
            final extent = _quickActionExtent(context);
            return GridView.builder(
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              itemCount: columns * 2,
              gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
                crossAxisCount: columns,
                mainAxisSpacing: AppSpacing.md,
                crossAxisSpacing: AppSpacing.md,
                mainAxisExtent: extent,
              ),
              itemBuilder: (context, index) => const AppSkeletonBox(
                width: double.infinity,
                height: double.infinity,
                radius: AppRadius.lg,
              ),
            );
          },
        ),
      ],
    );
  }
}

/// Two tiles across on a phone, more as the window widens (a tablet, a
/// foldable opened out) — the old fixed two-column grid left half a tablet
/// screen empty and stretched each tile into a letterbox.
int _quickActionColumns(double width) {
  if (width >= 900) return 5;
  if (width >= 700) return 4;
  if (width >= 480) return 3;
  return 2;
}

/// A fixed tile height that grows with the user's text-size setting. The grid
/// previously used a fixed 1.3 aspect ratio, which overflowed the tile as soon
/// as accessibility text scaling pushed the label onto a second line.
double _quickActionExtent(BuildContext context) {
  final scale = MediaQuery.textScalerOf(context).scale(14.5) / 14.5;
  return (124 + (scale - 1) * 56).clamp(124.0, 216.0);
}

/// The quick-launch grid. Column count follows the available width and each
/// tile gets a fixed height rather than a fixed aspect ratio, so widening the
/// window adds columns instead of stretching four tiles into letterboxes.
class _QuickActions extends StatelessWidget {
  const _QuickActions({required this.cards});

  final List<Widget> cards;

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) => GridView.builder(
        shrinkWrap: true,
        physics: const NeverScrollableScrollPhysics(),
        padding: EdgeInsets.zero,
        itemCount: cards.length,
        gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
          crossAxisCount: _quickActionColumns(constraints.maxWidth),
          mainAxisSpacing: AppSpacing.md,
          crossAxisSpacing: AppSpacing.md,
          mainAxisExtent: _quickActionExtent(context),
        ),
        // Staggered so the grid deals itself out rather than landing as one
        // block — the step is capped, so it never delays the fourth tap.
        itemBuilder: (context, index) =>
            AppFadeIn(delay: AppFadeIn.stagger(index), child: cards[index]),
      ),
    );
  }
}

class _DashboardBody extends StatelessWidget {
  const _DashboardBody({
    required this.data,
    required this.isTeaching,
    required this.isFamily,
    required this.isOffice,
  });

  final Map<String, dynamic> data;
  final bool isTeaching;
  final bool isFamily;
  final bool isOffice;

  @override
  Widget build(BuildContext context) {
    final role = data['role'] as String? ?? '';

    final home = data['home'] as Map<String, dynamic>? ?? const {};

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        if (isOffice || isTeaching) ...[
          const HomeGlobalSearch(),
          const SizedBox(height: AppSpacing.xl),
        ],
        if (isTeaching) ...[
          const _TodayTimetable(),
          const SizedBox(height: AppSpacing.xl),
        ],
        if (role == 'STUDENT') ...[
          _StudentTodayTimetable(
            entries: (home['timetable'] as List? ?? [])
                .cast<Map<String, dynamic>>(),
          ),
          const SizedBox(height: AppSpacing.xl),
        ],
        _AtAGlance(role: role, home: home),
        const SizedBox(height: AppSpacing.xl),
        const SectionHeader('Quick actions'),
        const SizedBox(height: AppSpacing.md),
        _QuickActions(
          // OFFICE (Owner/Principal/Admin) is not mutually exclusive with
          // wanting the day-to-day shortcuts below — a principal in
          // particular wants to check the school's attendance and homework
          // just as much as an office clerk wants Fee collection. The
          // backend already scopes AttendanceStatusScreen correctly for
          // office roles ("office sees every section, a teacher only their
          // own" — src/app/api/mobile/v1/attendance/status/route.ts), so
          // office roles land on the same school-wide screen a teacher does,
          // not the family-only MyAttendanceScreen.
          cards: [
            if (isOffice) ...[
              AppActionCard(
                icon: Icons.account_balance_wallet_outlined,
                label: 'Fee collection',
                tone: Tone.good,
                onTap: () => Navigator.of(context).push(
                  MaterialPageRoute(builder: (_) => const FeesOfficeScreen()),
                ),
              ),
              AppActionCard(
                icon: Icons.badge_outlined,
                label: 'Staff',
                tone: Tone.info,
                onTap: () => Navigator.of(context).push(
                  MaterialPageRoute(builder: (_) => const StaffListScreen()),
                ),
              ),
              AppActionCard(
                icon: Icons.how_to_reg_outlined,
                label: 'Admissions',
                tone: Tone.warn,
                onTap: () => Navigator.of(context).push(
                  MaterialPageRoute(builder: (_) => const AdmissionsScreen()),
                ),
              ),
              AppActionCard(
                icon: Icons.campaign_outlined,
                label: 'Notices',
                tone: Tone.brand,
                onTap: () => Navigator.of(context).push(
                  MaterialPageRoute(builder: (_) => const NoticesScreen()),
                ),
              ),
            ],
            AppActionCard(
              icon: Icons.fact_check_outlined,
              label: 'Attendance',
              tone: Tone.good,
              onTap: () => Navigator.of(context).push(
                MaterialPageRoute(
                  builder: (_) => isFamily
                      ? const MyAttendanceScreen()
                      : const AttendanceStatusScreen(),
                ),
              ),
            ),
            AppActionCard(
              icon: Icons.menu_book_outlined,
              label: 'Homework',
              tone: Tone.info,
              onTap: () => Navigator.of(context).push(
                MaterialPageRoute(builder: (_) => const HomeworkListScreen()),
              ),
            ),
            AppActionCard(
              icon: Icons.grid_view_outlined,
              label: 'Timetable',
              tone: Tone.warn,
              onTap: () => Navigator.of(context).push(
                MaterialPageRoute(
                  builder: (_) => isFamily
                      ? const MyTimetableScreen()
                      : const TimetableScreen(),
                ),
              ),
            ),
            AppActionCard(
              icon: Icons.groups_outlined,
              label: 'PTM',
              tone: Tone.brand,
              onTap: () => Navigator.of(context)
                  .push(MaterialPageRoute(builder: (_) => const PtmScreen())),
            ),
          ],
        ),
        if (isTeaching) ...[
          const SizedBox(height: AppSpacing.xl),
          const _ClassTeacherCard(),
        ],
        if (role == 'STUDENT') ...[
          const SizedBox(height: AppSpacing.xl),
          _HomeworkDue(
            items: (home['homework'] as List? ?? [])
                .cast<Map<String, dynamic>>(),
          ),
        ],
        if (role == 'PARENT') ...[
          const SizedBox(height: AppSpacing.xl),
          _ParentChildren(
            children: (home['children'] as List? ?? [])
                .cast<Map<String, dynamic>>(),
          ),
        ],
        if (role == 'OFFICE') ...[
          const SizedBox(height: AppSpacing.xl),
          _OfficeSnapshot(home: home['home'] as Map<String, dynamic>? ?? home),
        ],
      ],
    );
  }
}

/// "The one screen an owner opens daily" (per getOverview's own doc comment)
/// — fee collection, admissions pipeline, compliance alerts and upcoming
/// events, the same numbers src/app/app/page.tsx's office dashboard leads
/// with, condensed to what fits a phone. Home's Quick Actions cover the
/// day-to-day actions; this covers "is anything about the school itself
/// wrong right now."
class _OfficeSnapshot extends StatelessWidget {
  const _OfficeSnapshot({required this.home});

  final Map<String, dynamic> home;

  @override
  Widget build(BuildContext context) {
    // Only PRINCIPAL/OWNER/ACCOUNTANT get a `money` block from /home — ADMIN
    // (office/clerk) doesn't, and that absence means "not allowed to see
    // this", not "zero collected". Show the card only when it's there.
    final money = home['money'] as Map<String, dynamic>?;
    final admissions = home['admissions'] as Map<String, dynamic>? ?? const {};
    final compliance = home['compliance'] as Map<String, dynamic>? ?? const {};
    final library = home['library'] as Map<String, dynamic>? ?? const {};
    final events = (home['upcomingEvents'] as List? ?? [])
        .cast<Map<String, dynamic>>();

    final consentPending = compliance['consentPending'] as int? ?? 0;
    final unreturnedBooks = library['unreturnedBooks'] as int? ?? 0;
    final timetableToday = home['timetableToday'] as Map<String, dynamic>?;
    final staffPresentToday = home['staffPresentToday'] as int?;
    final staffCount = home['staffCount'] as int?;
    final outstanding = money?['outstanding'] as int? ?? 0;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        if (timetableToday != null) ...[
          SectionHeader(
            'School timetable — today',
            actionLabel: 'Full timetable',
            onAction: () => Navigator.of(context).push(
              MaterialPageRoute(builder: (_) => const SchoolTimetableScreen()),
            ),
          ),
          const SizedBox(height: AppSpacing.md),
          AppSummaryCard(
            margin: EdgeInsets.zero,
            stats: [
              AppStat(
                label: 'Currently',
                value: timetableToday['currentPeriod'] != null
                    ? 'Period ${timetableToday['currentPeriod']}'
                    : 'No period',
              ),
              AppStat(
                label: 'Sections in class',
                value: '${timetableToday['sectionsInSession'] ?? 0}',
              ),
            ],
          ),
          if (staffPresentToday != null &&
              staffCount != null &&
              staffCount > 0) ...[
            const SizedBox(height: AppSpacing.md),
            Wrap(
              spacing: AppSpacing.sm,
              runSpacing: AppSpacing.sm,
              children: [
                AppStatChip(
                  label: '$staffPresentToday/$staffCount staff present',
                  icon: Icons.badge_outlined,
                  tone: staffPresentToday == staffCount ? Tone.good : Tone.warn,
                ),
              ],
            ),
          ],
          const SizedBox(height: AppSpacing.xl),
        ],
        const SectionHeader('Snapshot'),
        const SizedBox(height: AppSpacing.md),
        // Two stats per band, not four — fee amounts run to seven-plus digits
        // and a single four-column row wraps them into an unreadable mess on
        // a phone-width screen.
        if (money != null)
          AppSummaryCard(
            margin: const EdgeInsets.only(bottom: AppSpacing.md),
            stats: [
              AppStat(
                label: 'Collected',
                value: formatMoney(money['collected'] as int? ?? 0),
                tone: Tone.good,
              ),
              AppStat(
                label: 'Outstanding',
                value: formatMoney(outstanding),
                tone: outstanding > 0 ? Tone.bad : null,
              ),
            ],
          ),
        AppSummaryCard(
          margin: EdgeInsets.zero,
          stats: [
            AppStat(
              label: 'Enquiries',
              value: '${admissions['newEnquiries'] ?? 0}',
            ),
            AppStat(
              label: 'Applications',
              value: '${admissions['openApplications'] ?? 0}',
            ),
          ],
        ),
        if (consentPending > 0 || unreturnedBooks > 0) ...[
          const SizedBox(height: AppSpacing.md),
          Wrap(
            spacing: AppSpacing.sm,
            runSpacing: AppSpacing.sm,
            children: [
              if (consentPending > 0)
                AppStatChip(
                  label: '$consentPending consent pending',
                  icon: Icons.privacy_tip_outlined,
                  tone: Tone.warn,
                ),
              if (unreturnedBooks > 0)
                AppStatChip(
                  label: '$unreturnedBooks books overdue',
                  icon: Icons.menu_book_outlined,
                  tone: Tone.warn,
                ),
            ],
          ),
        ],
        if (events.isNotEmpty) ...[
          const SizedBox(height: AppSpacing.xl),
          const SectionHeader('Upcoming'),
          const SizedBox(height: AppSpacing.md),
          AppSurface(
            clip: true,
            child: Column(
              children: [
                for (var i = 0; i < events.length; i++) ...[
                  _EventRow(
                    title: events[i]['title'] as String? ?? '',
                    date: events[i]['startDate'] as String?,
                  ),
                  if (i < events.length - 1)
                    const Divider(
                      height: 1,
                      indent: AppTile.dividerIndent,
                      endIndent: AppSpacing.lg,
                    ),
                ],
              ],
            ),
          ),
        ],
      ],
    );
  }
}

/// One upcoming event. The date became a calendar block on the left rather
/// than a grey string trailing off the right edge — "when" is what you scan a
/// list of events for, so it gets the strong position.
class _EventRow extends StatelessWidget {
  const _EventRow({required this.title, required this.date});

  final String title;
  final String? date;

  static const _months = [
    'JAN',
    'FEB',
    'MAR',
    'APR',
    'MAY',
    'JUN',
    'JUL',
    'AUG',
    'SEP',
    'OCT',
    'NOV',
    'DEC',
  ];

  @override
  Widget build(BuildContext context) {
    final parsed = date != null ? DateTime.tryParse(date!) : null;

    return Padding(
      padding: const EdgeInsets.symmetric(
        horizontal: AppSpacing.lg,
        vertical: AppSpacing.md,
      ),
      child: Row(
        children: [
          Container(
            width: 40,
            height: 44,
            decoration: BoxDecoration(
              color: AppColors.brandLight,
              borderRadius: BorderRadius.circular(AppRadius.sm),
            ),
            child: parsed == null
                ? const Icon(
                    Icons.event_outlined,
                    color: AppColors.brand,
                    size: 20,
                  )
                : Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Text(
                        _months[parsed.month - 1],
                        style: const TextStyle(
                          color: AppColors.brand,
                          fontSize: 9,
                          fontWeight: FontWeight.w800,
                          letterSpacing: 0.6,
                          height: 1.1,
                        ),
                      ),
                      Text(
                        '${parsed.day}',
                        style: const TextStyle(
                          color: AppColors.brandInk,
                          fontSize: 17,
                          fontWeight: FontWeight.w800,
                          height: 1.15,
                          letterSpacing: -0.4,
                        ),
                      ),
                    ],
                  ),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  title,
                  style: const TextStyle(
                    fontWeight: FontWeight.w600,
                    fontSize: 14.5,
                    height: 1.3,
                    letterSpacing: -0.2,
                  ),
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                ),
                if (date != null)
                  Padding(
                    padding: const EdgeInsets.only(top: 2),
                    child: Text(
                      formatDay(date!),
                      style: const TextStyle(
                        color: AppColors.ink3,
                        fontSize: 12.5,
                      ),
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

/// The same "what's due today" list every homework screen shows, surfaced on
/// Home so a student doesn't have to leave the dashboard to see it — mirrors
/// the teacher's "Today's timetable" placement, just the student's own
/// equivalent daily-glance content (src/lib/queries/role-home.ts::getStudentHome).
class _HomeworkDue extends StatelessWidget {
  const _HomeworkDue({required this.items});

  final List<Map<String, dynamic>> items;

  @override
  Widget build(BuildContext context) {
    if (items.isEmpty) return const SizedBox.shrink();

    void openList() => Navigator.of(context)
        .push(MaterialPageRoute(builder: (_) => const HomeworkListScreen()));

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SectionHeader(
          'Homework due',
          count: items.length,
          actionLabel: 'See all',
          onAction: openList,
        ),
        const SizedBox(height: AppSpacing.md),
        AppSurface(
          clip: true,
          child: Column(
            children: [
              for (var i = 0; i < items.length; i++)
                AppTile(
                  icon: Icons.menu_book_outlined,
                  tone: Tone.info,
                  label: items[i]['title'] as String? ?? '',
                  subtitle: [
                    (items[i]['subject'] as Map?)?['name'],
                    if (items[i]['dueOn'] != null)
                      'Due ${formatDay(items[i]['dueOn'] as String)}',
                  ].whereType<String>().join(' · '),
                  onTap: openList,
                  isLast: i == items.length - 1,
                ),
            ],
          ),
        ),
      ],
    );
  }
}

/// One card per child — attendance, fee dues, homework due count — so a
/// parent sees every child's status without leaving Home. Sourced from
/// getParentHome, which already computes all three per child in one call.
class _ParentChildren extends StatelessWidget {
  const _ParentChildren({required this.children});

  final List<Map<String, dynamic>> children;

  @override
  Widget build(BuildContext context) {
    if (children.isEmpty) return const SizedBox.shrink();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SectionHeader('Your children', count: children.length),
        const SizedBox(height: AppSpacing.md),
        for (var i = 0; i < children.length; i++)
          AppFadeIn(
            delay: AppFadeIn.stagger(i),
            child: _ChildCard(child: children[i]),
          ),
      ],
    );
  }
}

class _ChildCard extends StatelessWidget {
  const _ChildCard({required this.child});

  final Map<String, dynamic> child;

  @override
  Widget build(BuildContext context) {
    final attendance = child['attendance'] as Map<String, dynamic>?;
    final percentBp = attendance?['percentBp'] as int?;
    final dues = child['dues'] as Map<String, dynamic>?;
    final totalDue = dues?['total'] as int? ?? 0;
    final homeworkDue = (child['homeworkDue'] as List? ?? []).length;
    final name = child['name'] as String? ?? '';

    return Padding(
      padding: const EdgeInsets.only(bottom: AppSpacing.md),
      child: AppSurface(
        onTap: () =>
            Navigator.of(context)
                .push(MaterialPageRoute(builder: (_) => const FeesScreen())),
        padding: const EdgeInsets.all(AppSpacing.lg),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                // The child's initials, so a parent with several children can
                // pick the right card out at a glance instead of reading
                // three near-identical blocks of text.
                AppAvatar(name: name, size: 44),
                const SizedBox(width: AppSpacing.md + 2),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(
                        name,
                        style: const TextStyle(
                          fontWeight: FontWeight.w700,
                          fontSize: 16,
                          letterSpacing: -0.3,
                        ),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                      Text(
                        child['className'] as String? ?? '',
                        style: const TextStyle(
                          color: AppColors.ink3,
                          fontSize: 12.5,
                        ),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ],
                  ),
                ),
                const Icon(
                  Icons.chevron_right_rounded,
                  color: AppColors.line2,
                  size: 22,
                ),
              ],
            ),
            const SizedBox(height: AppSpacing.lg),
            Wrap(
              spacing: AppSpacing.sm,
              runSpacing: AppSpacing.sm,
              children: [
                if (percentBp != null)
                  AppStatChip(
                    label:
                        '${(percentBp / 100).toStringAsFixed(0)}% attendance',
                    tone: percentBp >= 7500 ? Tone.good : Tone.warn,
                  ),
                AppStatChip(
                  label: totalDue > 0 ? 'Dues pending' : 'Fees clear',
                  tone: totalDue > 0 ? Tone.bad : Tone.good,
                ),
                if (homeworkDue > 0)
                  AppStatChip(
                    label: '$homeworkDue homework due',
                    tone: Tone.info,
                  ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

/// Today's periods, laid out as a horizontal strip — the "what am I teaching
/// right now" view every teacher opens first, pulled from the same
/// /timetable/me the Timetable tab uses (myTimetableProvider). Silent when
/// there is nothing to show (no Staff row, e.g. a pure office account) —
/// this is a bonus on the dashboard, not a thing every role must have.
class _TodayTimetable extends ConsumerWidget {
  const _TodayTimetable();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final timetable = ref.watch(myTimetableProvider);

    return timetable.when(
      loading: () => const SizedBox.shrink(),
      error: (_, _) => const SizedBox.shrink(),
      data: (data) {
        final entries = (data['entries'] as List).cast<Map<String, dynamic>>();
        if (entries.isEmpty) return const SizedBox.shrink();

        return _PeriodStrip(
          onSeeAll: () => Navigator.of(context)
              .push(MaterialPageRoute(builder: (_) => const TimetableScreen())),
          items: [
            for (final entry in entries)
              _PeriodItem(
                period: '${entry['period']}',
                startTime: entry['startTime'] as String?,
                title: entry['subjectName'] as String? ?? 'Free period',
                subtitle: entry['className'] != null
                    ? '${entry['className']} ${entry['sectionName'] ?? ''}'
                          .trim()
                    : null,
              ),
          ],
        );
      },
    );
  }
}

/// A student's own today, straight from getStudentHome's `timetable` field
/// (already scoped to their section and today's day-of-week server-side) —
/// no extra request needed, unlike the teacher strip above which has its own
/// dedicated /timetable/me query.
class _StudentTodayTimetable extends StatelessWidget {
  const _StudentTodayTimetable({required this.entries});

  final List<Map<String, dynamic>> entries;

  @override
  Widget build(BuildContext context) {
    if (entries.isEmpty) return const SizedBox.shrink();

    return _PeriodStrip(
      onSeeAll: () => Navigator.of(context)
          .push(MaterialPageRoute(builder: (_) => const MyTimetableScreen())),
      items: [
        for (final entry in entries)
          _PeriodItem(
            period: '${entry['period']}',
            startTime: entry['startTime'] as String?,
            title:
                (entry['subject'] as Map?)?['name'] as String? ?? 'Free period',
            subtitle:
                ((entry['staff'] as Map?)?['user'] as Map?)?['name'] as String?,
          ),
      ],
    );
  }
}

/// One card's worth of period, already flattened out of whichever payload
/// shape it came from — the teacher and student feeds nest these differently
/// but render identically.
class _PeriodItem {
  const _PeriodItem({
    required this.period,
    required this.title,
    this.startTime,
    this.subtitle,
  });

  final String period;
  final String title;
  final String? startTime;
  final String? subtitle;
}

/// "Today's timetable" as a horizontally scrolling strip of period cards.
class _PeriodStrip extends StatelessWidget {
  const _PeriodStrip({required this.items, required this.onSeeAll});

  final List<_PeriodItem> items;
  final VoidCallback onSeeAll;

  @override
  Widget build(BuildContext context) {
    // Grows with the text-size setting rather than clipping the third line.
    final scale = MediaQuery.textScalerOf(context).scale(13.5) / 13.5;
    final height = (108 + (scale - 1) * 50).clamp(108.0, 184.0);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SectionHeader(
          "Today's timetable",
          count: items.length,
          actionLabel: 'See all',
          onAction: onSeeAll,
        ),
        const SizedBox(height: AppSpacing.md),
        SizedBox(
          height: height,
          child: ListView.separated(
            scrollDirection: Axis.horizontal,
            physics: const BouncingScrollPhysics(),
            clipBehavior: Clip.none,
            // Trailing peek: whenever a period would otherwise land flush
            // against the screen edge, this leaves enough of the next
            // card visible that "there's more, swipe" reads as obvious
            // rather than as a coincidentally-cropped last card.
            padding: const EdgeInsets.only(right: 48),
            itemCount: items.length,
            separatorBuilder: (_, _) => const SizedBox(width: AppSpacing.md),
            itemBuilder: (context, index) =>
                _PeriodCard(item: items[index], index: index),
          ),
        ),
      ],
    );
  }
}

/// One period. The period number moved out of a pill in the corner onto a
/// brand rail down the left edge, which is what lets the strip be read as an
/// ordered sequence at a glance rather than as five identical cards.
class _PeriodCard extends StatelessWidget {
  const _PeriodCard({required this.item, required this.index});

  final _PeriodItem item;
  final int index;

  @override
  Widget build(BuildContext context) {
    return AppFadeIn(
      delay: AppFadeIn.stagger(index),
      child: SizedBox(
        width: 158,
        child: AppSurface(
          clip: true,
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Container(
                width: 34,
                color: AppColors.brandLight,
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    const Text(
                      'P',
                      style: TextStyle(
                        color: AppColors.brand,
                        fontSize: 9.5,
                        fontWeight: FontWeight.w800,
                        letterSpacing: 0.5,
                        height: 1.1,
                      ),
                    ),
                    Text(
                      item.period,
                      style: const TextStyle(
                        color: AppColors.brandInk,
                        fontSize: 17,
                        fontWeight: FontWeight.w800,
                        height: 1.15,
                        letterSpacing: -0.4,
                      ),
                    ),
                  ],
                ),
              ),
              Expanded(
                child: Padding(
                  padding: const EdgeInsets.symmetric(
                    horizontal: AppSpacing.md,
                    vertical: AppSpacing.md,
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      if (item.startTime != null)
                        Text(
                          item.startTime!,
                          style: const TextStyle(
                            color: AppColors.ink3,
                            fontSize: 11,
                            fontWeight: FontWeight.w600,
                            letterSpacing: 0.2,
                          ),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                      const Spacer(),
                      Text(
                        item.title,
                        style: const TextStyle(
                          fontWeight: FontWeight.w700,
                          fontSize: 13.5,
                          height: 1.25,
                          letterSpacing: -0.2,
                        ),
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                      ),
                      if (item.subtitle != null && item.subtitle!.isNotEmpty)
                        Padding(
                          padding: const EdgeInsets.only(top: 2),
                          child: Text(
                            item.subtitle!,
                            style: const TextStyle(
                              color: AppColors.ink3,
                              fontSize: 11.5,
                            ),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                    ],
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// If this account is the class teacher of a section, that whole class's
/// week is their remit, not just the periods they personally teach — a
/// direct line into that section's full timetable grid.
class _ClassTeacherCard extends ConsumerWidget {
  const _ClassTeacherCard();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final result = ref.watch(staffMeProvider);

    return result.when(
      loading: () => const SizedBox.shrink(),
      error: (_, _) => const SizedBox.shrink(),
      data: (data) {
        final sections = (data['classTeacherOf'] as List? ?? [])
            .cast<Map<String, dynamic>>();
        if (sections.isEmpty) return const SizedBox.shrink();

        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const SectionHeader('Your class'),
            const SizedBox(height: AppSpacing.md),
            AppTileGroup(
              tiles: [
                for (final section in sections)
                  AppTileSpec(
                    Icons.groups_outlined,
                    '${section['className']} ${section['sectionName']}',
                    () => Navigator.of(context).push(
                      MaterialPageRoute(
                        builder: (_) => ClassTimetableScreen(
                          sectionId: section['sectionId'] as String,
                          sectionLabel:
                              '${section['className']} ${section['sectionName']}',
                        ),
                      ),
                    ),
                    subtitle: "This week's timetable",
                    tone: Tone.brand,
                  ),
              ],
            ),
          ],
        );
      },
    );
  }
}

/// A small role-specific summary strip — deliberately terse; the point of a
/// phone dashboard is "what do I do right now", not the web app's full
/// numbers-dense overview.
class _AtAGlance extends StatelessWidget {
  const _AtAGlance({required this.role, required this.home});

  final String role;
  final Map<String, dynamic> home;

  @override
  Widget build(BuildContext context) {
    // The office's glance is a set of figures worth reading at a size a
    // number deserves, not a row of pills fighting the page's other pills
    // for attention — same AppSummaryCard band the money figures use below,
    // so the two sit as one visual system rather than two competing ones.
    // The one thing here that's a genuine alert (a period with nobody
    // covering it) gets a banner instead, since a number that means "go fix
    // this now" shouldn't look like a number that means "here's a count".
    if (role == 'OFFICE') {
      final o = home['home'] as Map<String, dynamic>? ?? home;
      final timetableToday = o['timetableToday'] as Map<String, dynamic>?;
      final currentPeriod = timetableToday?['currentPeriod'] as int?;
      final uncoveredNow = timetableToday?['uncoveredNow'] as int? ?? 0;
      final staffAttendanceTaken =
          timetableToday?['staffAttendanceTaken'] == true;
      final staffPresent = o['staffPresentToday'] as int?;
      final staffCount = o['staffCount'] as int?;
      final defaulters =
          (o['money'] as Map<String, dynamic>?)?['defaulters'] as int? ?? 0;

      return Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          AppSummaryCard(
            margin: EdgeInsets.zero,
            stats: [
              AppStat(
                label: 'Right now',
                value: currentPeriod != null
                    ? 'Period $currentPeriod'
                    : 'No period',
                tone: currentPeriod != null ? Tone.brand : null,
              ),
              if (staffPresent != null && staffCount != null && staffCount > 0)
                AppStat(
                  label: 'Staff present',
                  value: '$staffPresent/$staffCount',
                  tone: staffPresent == staffCount ? Tone.good : Tone.warn,
                ),
              AppStat(
                label: 'Fee defaulters',
                value: '$defaulters',
                tone: defaulters > 0 ? Tone.bad : Tone.good,
              ),
            ],
          ),
          if (staffAttendanceTaken && uncoveredNow > 0) ...[
            const SizedBox(height: AppSpacing.sm),
            AppBanner(
              tone: Tone.bad,
              icon: Icons.warning_amber_rounded,
              message:
                  '$uncoveredNow section${uncoveredNow == 1 ? '' : 's'} in this period ${uncoveredNow == 1 ? 'has' : 'have'} no teacher covering it.',
            ),
          ],
        ],
      );
    }

    final chips = <Widget>[];

    switch (role) {
      case 'TEACHER':
        final sections = (home['sections'] as List? ?? [])
            .cast<Map<String, dynamic>>();
        final unmarked = sections.where((s) => s['marked'] != true).length;
        chips.add(
          AppStatChip(
            label: unmarked == 0
                ? 'All sections marked'
                : '$unmarked section${unmarked == 1 ? '' : 's'} to mark',
            icon: unmarked == 0
                ? Icons.check_circle_outlined
                : Icons.pending_outlined,
            tone: unmarked == 0 ? Tone.good : Tone.warn,
          ),
        );
        final homework = (home['homework'] as List? ?? []);
        if (homework.isNotEmpty) {
          chips.add(
            AppStatChip(
              label: '${homework.length} homework due soon',
              icon: Icons.menu_book_outlined,
              tone: Tone.info,
            ),
          );
        }
        break;
      case 'PARENT':
        final children = (home['children'] as List? ?? [])
            .cast<Map<String, dynamic>>();
        chips.add(
          AppStatChip(
            label:
                '${children.length} ${children.length == 1 ? 'child' : 'children'}',
            icon: Icons.family_restroom_outlined,
            tone: Tone.brand,
          ),
        );
        final duesPending = children
            .where((c) => ((c['dues'] as Map?)?['total'] as int? ?? 0) > 0)
            .length;
        if (duesPending > 0) {
          chips.add(
            AppStatChip(
              label: '$duesPending with fees due',
              icon: Icons.account_balance_wallet_outlined,
              tone: Tone.warn,
            ),
          );
        }
        break;
      case 'STUDENT':
        final percentBp = (home['attendance'] as Map?)?['percentBp'] as int?;
        if (percentBp != null) {
          chips.add(
            AppStatChip(
              label: '${(percentBp / 100).toStringAsFixed(0)}% attendance',
              icon: Icons.fact_check_outlined,
              tone: percentBp >= 7500 ? Tone.good : Tone.warn,
            ),
          );
        }
        final dueTotal = (home['dues'] as Map?)?['total'] as int? ?? 0;
        if (dueTotal > 0) {
          chips.add(
            const AppStatChip(
              label: 'Fees due',
              icon: Icons.account_balance_wallet_outlined,
              tone: Tone.bad,
            ),
          );
        }
        break;
    }

    if (chips.isEmpty) return const SizedBox.shrink();

    return Wrap(
      spacing: AppSpacing.sm,
      runSpacing: AppSpacing.sm,
      children: chips,
    );
  }
}
