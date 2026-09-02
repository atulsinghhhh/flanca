import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/auth/auth_state.dart';
import '../../core/network/api_exception.dart';
import '../../core/theme/app_theme.dart';
import 'notices_screen.dart';
import '../../core/widgets/app_widgets.dart';

const _audiences = [
  ('ALL', 'Everyone', Icons.public_outlined),
  ('TEACHERS', 'Teachers', Icons.school_outlined),
  ('STUDENTS', 'Students', Icons.backpack_outlined),
  ('PARENTS', 'Parents', Icons.family_restroom_outlined),
  ('STAFF', 'All staff', Icons.badge_outlined),
];

/// Mirrors src/app/app/notices — the office compose form, in-app only.
/// POST /notices resolves the audience to real recipients server-side; this
/// screen just collects title/body/audience and reports how many it reached.
class NoticeComposeScreen extends ConsumerStatefulWidget {
  const NoticeComposeScreen({super.key});

  @override
  ConsumerState<NoticeComposeScreen> createState() => _NoticeComposeScreenState();
}

class _NoticeComposeScreenState extends ConsumerState<NoticeComposeScreen> {
  final _titleController = TextEditingController();
  final _bodyController = TextEditingController();
  String _audience = 'ALL';
  bool _sending = false;

  @override
  void dispose() {
    _titleController.dispose();
    _bodyController.dispose();
    super.dispose();
  }

  Future<void> _publish() async {
    final title = _titleController.text.trim();
    final body = _bodyController.text.trim();
    if (title.isEmpty || body.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Give the notice a title and a body.')));
      return;
    }

    setState(() => _sending = true);
    try {
      final api = ref.read(apiClientProvider);
      final result = await api.post<Map<String, dynamic>>('/notices', data: {
        'title': title,
        'body': body,
        'audience': _audience,
      });
      ref.invalidate(noticesProvider);
      if (mounted) {
        Navigator.of(context).pop();
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text('Published — reached ${result['inApp']} people')));
      }
    } on ApiException catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppTopBar(title: 'New notice'),
      body: ListView(
        padding: const EdgeInsets.all(AppSpacing.ml),
        children: [
          AppFormSection(
            title: 'Notice',
            children: [
              TextField(
                controller: _titleController,
                decoration: const InputDecoration(labelText: 'Title'),
                textCapitalization: TextCapitalization.sentences,
              ),
              TextField(
                controller: _bodyController,
                decoration: const InputDecoration(labelText: 'Message'),
                minLines: 5,
                maxLines: 10,
                textCapitalization: TextCapitalization.sentences,
              ),
            ],
          ),
          const SizedBox(height: AppSpacing.lg),
          AppFormSection(
            title: 'Send to',
            children: [
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  for (final a in _audiences)
                    ChoiceChip(
                      label: Text(a.$2),
                      avatar: Icon(a.$3, size: 16, color: _audience == a.$1 ? Colors.white : AppColors.ink2),
                      selected: _audience == a.$1,
                      onSelected: (_) => setState(() => _audience = a.$1),
                      selectedColor: AppColors.brand,
                      labelStyle:
                          TextStyle(color: _audience == a.$1 ? Colors.white : AppColors.ink, fontWeight: FontWeight.w600),
                      showCheckmark: false,
                    ),
                ],
              ),
            ],
          ),
          const SizedBox(height: AppSpacing.xl),
          AppSubmitButton(
            label: 'Publish notice',
            icon: Icons.campaign_outlined,
            busy: _sending,
            onPressed: _publish,
          ),
        ],
      ),
    );
  }
}
