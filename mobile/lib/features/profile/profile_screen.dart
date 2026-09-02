import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/auth/auth_state.dart';
import '../../core/format.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/app_widgets.dart';
import 'change_password_screen.dart';
import 'student_profile_screen.dart' show studentProfileProvider;

final staffMeProvider = FutureProvider.autoDispose((ref) async {
  final api = ref.watch(apiClientProvider);
  return api.get<Map<String, dynamic>>('/staff/me');
});

/// The "who am I, signed in as what" tab. Carries the Account/Session block
/// that used to sit at the bottom of the More screen, plus the full record
/// behind the brief header: everything /students/me or /staff/me already knows
/// about this person, not just name/email/roles.
///
/// The identity block was a tinted box with centred text among a stack of
/// white cards; it is now a full brand-green panel that owns the top of the
/// screen, so "this is you" is settled before the record starts.
class ProfileScreen extends ConsumerWidget {
  const ProfileScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final actor = ref.watch(authControllerProvider).actor;
    final name = actor?.name ?? '';
    final isFamily = actor?.hasAnyRole(['STUDENT', 'PARENT']) ?? false;

    return Scaffold(
      appBar: const AppTopBar(title: 'Profile'),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(
          AppSpacing.page,
          AppSpacing.xs,
          AppSpacing.page,
          AppSpacing.xxl,
        ),
        children: [
          _IdentityPanel(
            name: name,
            email: actor?.email ?? '',
            roles: actor?.roles ?? const <String>[],
          ),
          const SizedBox(height: AppSpacing.xl),
          if (isFamily) const _StudentDetails() else const _StaffDetails(),
          const SizedBox(height: AppSpacing.xl),
          const SectionHeader('Session'),
          const SizedBox(height: AppSpacing.md),
          AppTileGroup(
            tiles: [
              AppTileSpec(
                Icons.lock_outlined,
                'Change password',
                () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const ChangePasswordScreen())),
                subtitle: 'Update the password you sign in with',
              ),
              AppTileSpec(
                Icons.logout_outlined,
                'Sign out',
                () => ref.read(authControllerProvider.notifier).signOut(),
                tone: Tone.bad,
                // No chevron: this acts in place rather than pushing a screen.
                trailing: const SizedBox.shrink(),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

/// The header panel — the one full block of brand green inside the signed-in
/// app. Avatar, name, email, and the account's roles as translucent pills, on
/// the same off-canvas light washes the sign-in hero uses so the two read as
/// one family.
class _IdentityPanel extends StatelessWidget {
  const _IdentityPanel({required this.name, required this.email, required this.roles});

  final String name;
  final String email;
  final List<String> roles;

  @override
  Widget build(BuildContext context) {
    return ClipRRect(
      borderRadius: BorderRadius.circular(AppRadius.xl),
      child: DecoratedBox(
        decoration: BoxDecoration(
          color: AppColors.brand,
          borderRadius: BorderRadius.circular(AppRadius.xl),
          boxShadow: AppShadows.brand,
        ),
        child: Stack(
          children: [
            Positioned(
              right: -46,
              top: -60,
              child: Container(
                width: 172,
                height: 172,
                decoration: BoxDecoration(
                  color: Colors.white.withValues(alpha: 0.09),
                  shape: BoxShape.circle,
                ),
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(AppSpacing.ml, AppSpacing.ml, AppSpacing.ml, AppSpacing.ml),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Container(
                        width: 60,
                        height: 60,
                        alignment: Alignment.center,
                        decoration: BoxDecoration(
                          color: Colors.white.withValues(alpha: 0.18),
                          shape: BoxShape.circle,
                          border: Border.all(color: Colors.white.withValues(alpha: 0.32), width: 1.5),
                        ),
                        child: Text(
                          AppAvatar.initialsOf(name),
                          style: const TextStyle(
                            color: Colors.white,
                            fontWeight: FontWeight.w800,
                            fontSize: 22,
                            letterSpacing: -0.4,
                            height: 1,
                          ),
                        ),
                      ),
                      const SizedBox(width: AppSpacing.lg),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Text(
                              name,
                              style: const TextStyle(
                                color: Colors.white,
                                fontSize: 21,
                                fontWeight: FontWeight.w800,
                                letterSpacing: -0.5,
                                height: 1.2,
                              ),
                              maxLines: 2,
                              overflow: TextOverflow.ellipsis,
                            ),
                            if (email.isNotEmpty)
                              Padding(
                                padding: const EdgeInsets.only(top: 3),
                                child: Text(
                                  email,
                                  style: TextStyle(
                                    color: Colors.white.withValues(alpha: 0.82),
                                    fontSize: 13,
                                    height: 1.35,
                                  ),
                                  maxLines: 2,
                                  overflow: TextOverflow.ellipsis,
                                ),
                              ),
                          ],
                        ),
                      ),
                    ],
                  ),
                  if (roles.isNotEmpty) ...[
                    const SizedBox(height: AppSpacing.ml),
                    Wrap(
                      spacing: 6,
                      runSpacing: 6,
                      children: [
                        for (final role in roles)
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: AppSpacing.md, vertical: 5),
                            decoration: BoxDecoration(
                              color: Colors.white.withValues(alpha: 0.16),
                              borderRadius: BorderRadius.circular(AppRadius.pill),
                              border: Border.all(color: Colors.white.withValues(alpha: 0.22)),
                            ),
                            child: Text(
                              role,
                              style: const TextStyle(
                                color: Colors.white,
                                fontSize: 11.5,
                                fontWeight: FontWeight.w700,
                                letterSpacing: 0.3,
                                height: 1.3,
                              ),
                            ),
                          ),
                      ],
                    ),
                  ],
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Full record for STUDENT/PARENT, from the same /students/me the Profile
/// (student_profile_screen.dart) and Report cards screens already use — a
/// parent sees one card per child.
class _StudentDetails extends ConsumerWidget {
  const _StudentDetails();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final result = ref.watch(studentProfileProvider);

    return result.when(
      loading: () => const AppCardsSkeleton(cards: 1, padding: EdgeInsets.zero),
      error: (err, _) => ErrorView(error: err, onRetry: () => ref.invalidate(studentProfileProvider)),
      data: (data) {
        final children = data['children'] as List?;
        final profiles = children != null ? children.cast<Map<String, dynamic>>() : [data];

        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            for (final profile in profiles)
              Builder(builder: (context) {
                final student = profile['student'] as Map<String, dynamic>?;
                if (student == null) return const SizedBox.shrink();

                final className = (student['class'] as Map?)?['name'] as String? ?? '';
                final sectionName = (student['section'] as Map?)?['name'] as String? ?? '';
                final dob = student['dob'] as String?;

                return Padding(
                  padding: const EdgeInsets.only(bottom: AppSpacing.ml),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      SectionHeader(
                        profiles.length > 1 ? (student['name'] as String? ?? 'Student') : 'Student details',
                      ),
                      const SizedBox(height: AppSpacing.md),
                      AppKeyValueGroup(rows: [
                        AppKeyValue(label: 'Admission no.', value: student['admissionNumber'] as String? ?? '—'),
                        AppKeyValue(
                          label: 'Class',
                          value: '$className $sectionName'.trim().isEmpty
                              ? '—'
                              : '$className $sectionName'.trim(),
                        ),
                        AppKeyValue(label: 'Roll no.', value: '${student['rollNumber'] ?? '—'}'),
                        if (dob != null) AppKeyValue(label: 'Date of birth', value: formatDay(dob)),
                        if (student['gender'] != null)
                          AppKeyValue(label: 'Gender', value: student['gender'] as String),
                        if (student['bloodGroup'] != null)
                          AppKeyValue(label: 'Blood group', value: student['bloodGroup'] as String),
                        if ((student['address'] as String?)?.isNotEmpty ?? false)
                          AppKeyValue(label: 'Address', value: student['address'] as String),
                        if ((student['fatherName'] as String?)?.isNotEmpty ?? false)
                          AppKeyValue(label: "Father's name", value: student['fatherName'] as String),
                        if ((student['motherName'] as String?)?.isNotEmpty ?? false)
                          AppKeyValue(label: "Mother's name", value: student['motherName'] as String),
                        if ((student['guardianPhone'] as String?)?.isNotEmpty ?? false)
                          AppKeyValue(label: 'Guardian phone', value: student['guardianPhone'] as String),
                        if ((student['guardianEmail'] as String?)?.isNotEmpty ?? false)
                          AppKeyValue(label: 'Guardian email', value: student['guardianEmail'] as String),
                      ]),
                    ],
                  ),
                );
              }),
          ],
        );
      },
    );
  }
}

/// Full record for staff roles (office/teaching/money/library), from the new
/// /staff/me — the employment side of the account, not the office's staff
/// directory (that stays office-only, mobile/lib/features/staff/*).
class _StaffDetails extends ConsumerWidget {
  const _StaffDetails();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final result = ref.watch(staffMeProvider);

    return result.when(
      loading: () => const AppCardsSkeleton(cards: 1, padding: EdgeInsets.zero),
      error: (err, _) => ErrorView(error: err, onRetry: () => ref.invalidate(staffMeProvider)),
      data: (data) {
        final staff = data['staff'] as Map<String, dynamic>?;
        if (staff == null) return const SizedBox.shrink();

        final joiningDate = staff['joiningDate'] as String?;
        final subjects = (staff['subjects'] as List?)?.cast<String>() ?? const [];

        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const SectionHeader('Employment details'),
            const SizedBox(height: AppSpacing.md),
            AppKeyValueGroup(rows: [
              AppKeyValue(label: 'Employee ID', value: staff['employeeId'] as String? ?? '—'),
              if ((staff['designation'] as String?)?.isNotEmpty ?? false)
                AppKeyValue(label: 'Designation', value: staff['designation'] as String),
              if ((staff['department'] as String?)?.isNotEmpty ?? false)
                AppKeyValue(label: 'Department', value: staff['department'] as String),
              if (joiningDate != null) AppKeyValue(label: 'Joined on', value: formatDay(joiningDate)),
              if ((staff['qualification'] as String?)?.isNotEmpty ?? false)
                AppKeyValue(label: 'Qualification', value: staff['qualification'] as String),
              if ((staff['phone'] as String?)?.isNotEmpty ?? false)
                AppKeyValue(label: 'Phone', value: staff['phone'] as String),
              if ((staff['address'] as String?)?.isNotEmpty ?? false)
                AppKeyValue(label: 'Address', value: staff['address'] as String),
              if (subjects.isNotEmpty) AppKeyValue(label: 'Subjects', value: subjects.join(', ')),
            ]),
          ],
        );
      },
    );
  }
}
