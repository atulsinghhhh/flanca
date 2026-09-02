import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/auth/auth_state.dart';
import '../../core/network/api_exception.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/app_widgets.dart';

/// Mirrors src/app/set-password — a slip-issued account is held here until it
/// picks its own password (src/lib/session.ts::requireActor's mustChangePassword gate).
class SetPasswordScreen extends ConsumerStatefulWidget {
  const SetPasswordScreen({super.key});

  @override
  ConsumerState<SetPasswordScreen> createState() => _SetPasswordScreenState();
}

class _SetPasswordScreenState extends ConsumerState<SetPasswordScreen> {
  final _formKey = GlobalKey<FormState>();
  final _currentController = TextEditingController();
  final _nextController = TextEditingController();
  final _confirmController = TextEditingController();
  bool _submitting = false;
  String? _error;

  @override
  void dispose() {
    _currentController.dispose();
    _nextController.dispose();
    _confirmController.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() {
      _submitting = true;
      _error = null;
    });
    try {
      await ref.read(authControllerProvider.notifier).setPassword(
            current: _currentController.text,
            next: _nextController.text,
            confirm: _confirmController.text,
          );
    } on ApiException catch (e) {
      setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppTopBar(title: 'Choose your password'),
      body: SafeArea(
        child: SingleChildScrollView(
          // Scrollable rather than a bare centred Column: with three fields,
          // an error banner and the keyboard up, the old fixed layout had
          // nowhere to go on a small phone.
          keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
          padding: const EdgeInsets.fromLTRB(AppSpacing.xl, AppSpacing.sm, AppSpacing.xl, AppSpacing.xl),
          child: Center(
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 420),
              child: Form(
                key: _formKey,
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Container(
                      width: 52,
                      height: 52,
                      alignment: Alignment.center,
                      decoration: BoxDecoration(
                        color: AppColors.brandLight,
                        borderRadius: BorderRadius.circular(AppRadius.lg),
                      ),
                      child: const Icon(Icons.lock_reset_outlined, color: AppColors.brand, size: 26),
                    ),
                    const SizedBox(height: AppSpacing.lg),
                    Text('One last step', style: Theme.of(context).textTheme.headlineSmall),
                    const SizedBox(height: 6),
                    const Text(
                      'The code you were given only lets you do one thing: pick a '
                      'password of your own.',
                      style: TextStyle(color: AppColors.ink3, fontSize: 13.5, height: 1.45),
                    ),
                    const SizedBox(height: 28),
                    AppPasswordField(
                      controller: _currentController,
                      label: 'Code on your slip',
                      prefixIcon: Icons.confirmation_number_outlined,
                      textInputAction: TextInputAction.next,
                      validator: (v) => (v == null || v.isEmpty) ? 'Required' : null,
                    ),
                    const SizedBox(height: 14),
                    AppPasswordField(
                      controller: _nextController,
                      label: 'New password',
                      prefixIcon: Icons.lock_outlined,
                      helperText: 'At least 8 characters',
                      textInputAction: TextInputAction.next,
                      validator: (v) => (v == null || v.length < 8) ? 'At least 8 characters' : null,
                    ),
                    const SizedBox(height: 14),
                    AppPasswordField(
                      controller: _confirmController,
                      label: 'Confirm new password',
                      prefixIcon: Icons.lock_outlined,
                      textInputAction: TextInputAction.done,
                      onFieldSubmitted: (_) => _submit(),
                      validator: (v) => (v == null || v.isEmpty) ? 'Required' : null,
                    ),
                    if (_error != null) ...[
                      const SizedBox(height: AppSpacing.lg),
                      AppErrorBanner(_error!),
                    ],
                    const SizedBox(height: 26),
                    AppSubmitButton(
                      label: 'Save password',
                      busy: _submitting,
                      onPressed: _submit,
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
