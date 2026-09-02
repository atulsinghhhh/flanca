import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/auth/auth_state.dart';
import '../../core/network/api_exception.dart';
import '../../core/widgets/app_widgets.dart';
import '../profile/student_profile_screen.dart';
import '../../core/theme/app_theme.dart';

final tutorStatusProvider = FutureProvider.autoDispose((ref) async {
  final api = ref.watch(apiClientProvider);
  return api.get<Map<String, dynamic>>('/tutor/status');
});

/// One tap into the external AI tutor, already signed in — mirrors
/// src/app/app/tutor/enter-action.ts::enterTutor. The handoff URL is minted
/// fresh on each tap and used immediately, never stored.
class TutorScreen extends ConsumerWidget {
  const TutorScreen({super.key});

  Future<void> _open(BuildContext context, WidgetRef ref, String studentId) async {
    try {
      final api = ref.read(apiClientProvider);
      final data = await api.post<Map<String, dynamic>>('/tutor/enter', data: {'studentId': studentId});
      final url = data['url'] as String;
      await launchUrl(Uri.parse(url), mode: LaunchMode.externalApplication);
    } on ApiException catch (e) {
      if (context.mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final status = ref.watch(tutorStatusProvider);
    final profile = ref.watch(studentProfileProvider);

    return Scaffold(
      appBar: AppTopBar(title: 'Tutor'),
      body: status.when(
        loading: () => const AppCardsSkeleton(cards: 2),
        error: (err, _) => ErrorView(error: err, onRetry: () => ref.invalidate(tutorStatusProvider)),
        data: (statusData) {
          if (statusData['on'] != true) {
            return const EmptyState(
              icon: Icons.auto_stories_outlined,
              title: 'Tutor unavailable', message: 'The AI tutor is not set up for this school.',
            );
          }
          return profile.when(
            loading: () => const AppCardsSkeleton(cards: 2),
            error: (err, _) => ErrorView(error: err, onRetry: () => ref.invalidate(studentProfileProvider)),
            data: (profileData) {
              final children = profileData['children'] as List?;
              final entries = children != null
                  ? children.cast<Map<String, dynamic>>()
                  : [profileData];

              return ListView(
                padding: const EdgeInsets.all(AppSpacing.ml),
                children: entries.map((entry) {
                  final student = entry['student'] as Map<String, dynamic>?;
                  if (student == null) return const SizedBox.shrink();
                  return AppSurface(
                    margin: const EdgeInsets.only(bottom: 12),
                    child: AppListRow(
                      icon: Icons.auto_stories_outlined,
                      tone: Tone.brand,
                      title: student['name'] as String? ?? '',
                      trailing: FilledButton(
                        onPressed: () => _open(context, ref, student['id'] as String),
                        child: const Text('Open'),
                      ),
                    ),
                  );
                }).toList(),
              );
            },
          );
        },
      ),
    );
  }
}
