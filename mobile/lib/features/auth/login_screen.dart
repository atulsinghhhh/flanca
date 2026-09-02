import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/auth/auth_state.dart';
import '../../core/network/api_exception.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/app_widgets.dart';

/// Mirrors src/app/login/page.tsx's tone (brand-green hero, "eyebrow +
/// welcome back" form header) compressed for one phone-width column instead
/// of the web's two-column split — same palette, same voice.
///
/// Restructured in the 2026 pass from "green block, then a bare column of
/// fields" into a full-bleed brand hero with the form riding up over it on
/// its own floating sheet: the fold now lands on the first field instead of
/// on empty paper, and the screen has one obvious focal point.
class LoginScreen extends ConsumerStatefulWidget {
  const LoginScreen({super.key});

  @override
  ConsumerState<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends ConsumerState<LoginScreen> {
  final _formKey = GlobalKey<FormState>();
  final _identifierController = TextEditingController();
  final _passwordController = TextEditingController();
  bool _submitting = false;
  String? _error;

  @override
  void dispose() {
    _identifierController.dispose();
    _passwordController.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() {
      _submitting = true;
      _error = null;
    });
    try {
      await ref.read(authControllerProvider.notifier).signIn(
            identifier: _identifierController.text.trim(),
            password: _passwordController.text,
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
      backgroundColor: AppColors.paper,
      body: SingleChildScrollView(
        // Ends above the keyboard rather than behind it, and lets the user
        // dismiss the keyboard by dragging the form.
        keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
        child: ConstrainedBox(
          constraints: BoxConstraints(minHeight: MediaQuery.sizeOf(context).height),
          child: Column(
            children: [
              const _Hero(),
              // The sheet rides up over the hero's lower edge. Transform, not
              // margin, so the overlap is purely visual and the scroll extent
              // stays honest.
              Transform.translate(
                offset: const Offset(0, -28),
                child: Padding(
                  padding: EdgeInsets.fromLTRB(
                    AppSpacing.page,
                    0,
                    AppSpacing.page,
                    AppSpacing.xl + MediaQuery.viewInsetsOf(context).bottom,
                  ),
                  child: Center(
                    child: ConstrainedBox(
                      // Caps the measure on a tablet, where a full-width form
                      // would stretch the fields edge to edge.
                      constraints: const BoxConstraints(maxWidth: 440),
                      child: AppSurface(
                        padding: const EdgeInsets.fromLTRB(
                          AppSpacing.ml,
                          AppSpacing.xl,
                          AppSpacing.ml,
                          AppSpacing.ml,
                        ),
                        radius: AppRadius.xl,
                        shadows: AppShadows.raised,
                        child: Form(
                          key: _formKey,
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.stretch,
                            children: [
                              const Eyebrow('Sign in'),
                              const SizedBox(height: AppSpacing.sm),
                              Text('Welcome back', style: Theme.of(context).textTheme.headlineSmall),
                              const SizedBox(height: 6),
                              const Text(
                                'Use your school email or mobile number.',
                                style: TextStyle(color: AppColors.ink3, fontSize: 13.5, height: 1.45),
                              ),
                              const SizedBox(height: AppSpacing.xl),
                              TextFormField(
                                controller: _identifierController,
                                style: const TextStyle(fontSize: 15.5, fontWeight: FontWeight.w600),
                                decoration: const InputDecoration(
                                  labelText: 'Email or mobile',
                                  prefixIcon: Icon(Icons.alternate_email_rounded, size: 20),
                                ),
                                keyboardType: TextInputType.emailAddress,
                                textInputAction: TextInputAction.next,
                                autofillHints: const [AutofillHints.username],
                                validator: (v) => (v == null || v.trim().isEmpty) ? 'Required' : null,
                              ),
                              const SizedBox(height: AppSpacing.md),
                              AppPasswordField(
                                controller: _passwordController,
                                label: 'Password',
                                prefixIcon: Icons.lock_outlined,
                                textInputAction: TextInputAction.done,
                                onFieldSubmitted: (_) => _submit(),
                                validator: (v) => (v == null || v.isEmpty) ? 'Required' : null,
                              ),
                              if (_error != null) ...[
                                const SizedBox(height: AppSpacing.lg),
                                AppErrorBanner(_error!),
                              ],
                              const SizedBox(height: AppSpacing.xl),
                              AppSubmitButton(
                                label: 'Sign in',
                                icon: Icons.arrow_forward_rounded,
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
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// The brand-green panel that opens the screen — the one place on mobile that
/// gets a full block of the institutional green rather than an accent,
/// mirroring the web login's left rail.
///
/// Now full-bleed to the top of the display (it runs behind the status bar)
/// with two soft light washes reading as depth, rather than a flat rectangle
/// with a hard bottom edge.
class _Hero extends StatelessWidget {
  const _Hero();

  @override
  Widget build(BuildContext context) {
    // A short viewport (a small phone with the keyboard up, or landscape) gets
    // a shallower hero so the form itself stays on screen.
    final short = MediaQuery.sizeOf(context).height < 680;
    final topInset = MediaQuery.paddingOf(context).top;

    return ClipRRect(
      borderRadius: const BorderRadius.only(
        bottomLeft: Radius.circular(36),
        bottomRight: Radius.circular(36),
      ),
      child: Container(
        width: double.infinity,
        color: AppColors.brand,
        child: Stack(
          children: [
            // Two off-canvas discs of white at very low alpha. Cheap, no
            // gradient shader, and they give the flat fill somewhere for the
            // eye to land instead of reading as a printed swatch.
            Positioned(
              right: -70,
              top: -50,
              child: _Wash(size: 210, alpha: 0.10),
            ),
            Positioned(
              left: -60,
              bottom: -90,
              child: _Wash(size: 190, alpha: 0.07),
            ),
            Padding(
              padding: EdgeInsets.fromLTRB(
                AppSpacing.page + AppSpacing.sm,
                topInset + (short ? AppSpacing.xl : AppSpacing.xxxl),
                AppSpacing.page + AppSpacing.sm,
                (short ? AppSpacing.xxl : AppSpacing.xxxl) + AppSpacing.xl,
              ),
              child: Center(
                child: ConstrainedBox(
                  constraints: const BoxConstraints(maxWidth: 440),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Container(
                        width: 58,
                        height: 58,
                        alignment: Alignment.center,
                        decoration: BoxDecoration(
                          color: Colors.white.withValues(alpha: 0.18),
                          borderRadius: BorderRadius.circular(AppRadius.md),
                          border: Border.all(color: Colors.white.withValues(alpha: 0.26), width: 1.5),
                        ),
                        child: const Text(
                          'F',
                          style: TextStyle(
                            color: Colors.white,
                            fontSize: 27,
                            fontWeight: FontWeight.w800,
                            letterSpacing: -0.5,
                            height: 1,
                          ),
                        ),
                      ),
                      SizedBox(height: short ? AppSpacing.lg : AppSpacing.xl),
                      const Text(
                        'Flanca',
                        style: TextStyle(
                          color: Colors.white,
                          fontSize: 30,
                          fontWeight: FontWeight.w800,
                          letterSpacing: -0.9,
                          height: 1.1,
                        ),
                      ),
                      const SizedBox(height: AppSpacing.sm),
                      Text(
                        'Attendance, fees, homework, exams — everything in one place.',
                        style: TextStyle(
                          color: Colors.white.withValues(alpha: 0.85),
                          fontSize: 14.5,
                          height: 1.5,
                          fontWeight: FontWeight.w500,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _Wash extends StatelessWidget {
  const _Wash({required this.size, required this.alpha});

  final double size;
  final double alpha;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: alpha),
        shape: BoxShape.circle,
      ),
    );
  }
}
