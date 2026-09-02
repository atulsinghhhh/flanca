import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/auth/auth_state.dart';
import '../../core/network/api_exception.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/app_widgets.dart';

/// Mirrors src/app/app/settings/password-card.tsx: anybody signed in
/// changing their own password, at any time — distinct from the forced
/// first-login flow (set_password_screen.dart), which rotates all refresh
/// tokens; this one doesn't touch the current session.
class ChangePasswordScreen extends ConsumerStatefulWidget {
  const ChangePasswordScreen({super.key});

  @override
  ConsumerState<ChangePasswordScreen> createState() => _ChangePasswordScreenState();
}

class _ChangePasswordScreenState extends ConsumerState<ChangePasswordScreen> {
  final _currentController = TextEditingController();
  final _nextController = TextEditingController();
  final _againController = TextEditingController();
  bool _saving = false;
  String? _error;

  @override
  void dispose() {
    _currentController.dispose();
    _nextController.dispose();
    _againController.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final current = _currentController.text;
    final next = _nextController.text;
    final again = _againController.text;

    if (next.length < 8) {
      setState(() => _error = 'New password must be at least 8 characters.');
      return;
    }
    if (next != again) {
      setState(() => _error = 'New passwords do not match.');
      return;
    }

    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      final api = ref.read(apiClientProvider);
      await api.post('/account/change-password', data: {'current': current, 'next': next});
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Password changed')));
        Navigator.of(context).pop();
      }
    } on ApiException catch (e) {
      setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppTopBar(title: 'Change password'),
      body: ListView(
        keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
        padding: const EdgeInsets.fromLTRB(AppSpacing.lg, AppSpacing.sm, AppSpacing.lg, AppSpacing.xl),
        children: [
          Center(
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 420),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  const Text(
                    'Pick something you have not used on this account before.',
                    style: TextStyle(color: AppColors.ink3, fontSize: 13.5, height: 1.45),
                  ),
                  const SizedBox(height: AppSpacing.xl),
                  AppPasswordField(
                    controller: _currentController,
                    label: 'Current password',
                    prefixIcon: Icons.lock_outlined,
                    textInputAction: TextInputAction.next,
                  ),
                  const SizedBox(height: 14),
                  AppPasswordField(
                    controller: _nextController,
                    label: 'New password',
                    prefixIcon: Icons.lock_reset_outlined,
                    helperText: 'At least 8 characters',
                    textInputAction: TextInputAction.next,
                  ),
                  const SizedBox(height: 14),
                  AppPasswordField(
                    controller: _againController,
                    label: 'Confirm new password',
                    prefixIcon: Icons.lock_reset_outlined,
                    textInputAction: TextInputAction.done,
                    onFieldSubmitted: (_) => _submit(),
                  ),
                  if (_error != null) ...[
                    const SizedBox(height: AppSpacing.lg),
                    AppErrorBanner(_error!),
                  ],
                  const SizedBox(height: 26),
                  AppSubmitButton(
                    label: 'Change password',
                    busy: _saving,
                    onPressed: _submit,
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}
