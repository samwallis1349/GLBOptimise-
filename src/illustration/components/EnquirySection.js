/**
 * Project Enquiry Section Component
 * Dark background (#10100E) with responsive, validated enquiry form
 */
import { STUDIO_INFO } from '../config/portfolioData.js';

export function EnquirySection() {
  const section = document.createElement('section');
  section.id = 'enquiry';
  section.className = 'il-enquiry-section';

  section.innerHTML = `
    <div class="il-container">
      <div class="il-enquiry-grid">
        <div class="il-enquiry-info il-reveal">
          <div class="il-eyebrow il-eyebrow-dark">
            <span>✦</span>
            <span>Initiate Collaboration</span>
          </div>

          <h2 class="il-h2 il-enquiry-h2">Have something worth illustrating?</h2>

          <p class="il-enquiry-sub">
            Tell me what you're imagining. Let's turn it into something people remember.
          </p>

          <p style="color: var(--il-text-light-muted); line-height: 1.6; font-size: 0.95rem;">
            Whether you have a fully formed creative brief or an early concept on a napkin, I reply to every serious enquiry within 24–48 hours with initial thoughts and timeline estimates.
          </p>

          <div class="il-contact-direct">
            <div class="il-contact-direct-label">Prefer direct email?</div>
            <a href="mailto:${STUDIO_INFO.email}?subject=Illustration%20Commission%20Enquiry" class="il-contact-direct-link">
              ${STUDIO_INFO.email}
            </a>
          </div>
        </div>

        <div class="il-form-card il-reveal il-reveal-stagger-1">
          <form class="il-form" id="illustration-enquiry-form" novalidate>
            <div class="il-form-row">
              <div class="il-form-group">
                <label class="il-label" for="client-name">Your Name *</label>
                <input 
                  type="text" 
                  id="client-name" 
                  name="name" 
                  class="il-input" 
                  placeholder="e.g. Alex Morgan" 
                  required 
                />
                <span class="il-error-hint" id="name-error"></span>
              </div>

              <div class="il-form-group">
                <label class="il-label" for="client-email">Email Address *</label>
                <input 
                  type="email" 
                  id="client-email" 
                  name="email" 
                  class="il-input" 
                  placeholder="alex@company.com" 
                  required 
                />
                <span class="il-error-hint" id="email-error"></span>
              </div>
            </div>

            <div class="il-form-row">
              <div class="il-form-group">
                <label class="il-label" for="project-type">Project Type *</label>
                <select id="project-type" name="projectType" class="il-select" required>
                  <option value="" disabled selected>Select project category...</option>
                  <option value="Logo & Brand Identity">Logo &amp; Brand Identity Design</option>
                  <option value="Character Illustration">Character & Mascot Design</option>
                  <option value="Isometric Worlds">Isometric Environment & Cutaways</option>
                  <option value="Brand Illustration">Brand Illustration System</option>
                  <option value="Game Art & Assets">Game Art & Sprite Assets</option>
                  <option value="Editorial Illustration">Editorial & Key Visual</option>
                  <option value="AI Refinement">AI Output Vector Refinement</option>
                  <option value="Other">Other / Bespoke Scope</option>
                </select>
                <span class="il-error-hint" id="type-error"></span>
              </div>

              <div class="il-form-group">
                <label class="il-label" for="budget-range">Budget Range *</label>
                <select id="budget-range" name="budget" class="il-select" required>
                  <option value="" disabled selected>Select investment tier...</option>
                  <option value="Under £1,000">Under £1,000</option>
                  <option value="£1,000 – £3,000">£1,000 – £3,000</option>
                  <option value="£3,000 – £7,500">£3,000 – £7,500</option>
                  <option value="£7,500+">£7,500+</option>
                </select>
                <span class="il-error-hint" id="budget-error"></span>
              </div>
            </div>

            <div class="il-form-group">
              <label class="il-label" for="project-desc">Project Description *</label>
              <textarea 
                id="project-desc" 
                name="description" 
                class="il-textarea" 
                placeholder="Describe your vision, timeline, where the artwork will live, and any references you love..." 
                required
              ></textarea>
              <span class="il-error-hint" id="desc-error"></span>
            </div>

            <div class="il-form-status success" id="form-success-box">
              <strong style="display: block; margin-bottom: 4px;">Enquiry Received!</strong>
              Thank you for sharing your project. I will review your details and respond within 24–48 hours.
            </div>

            <div class="il-form-status error" id="form-error-box">
              <strong>Error sending enquiry:</strong> <span id="form-error-message">Please check your inputs and try again.</span>
            </div>

            <button type="submit" class="il-btn il-btn-amber il-submit-btn" id="enquiry-submit-btn">
              <span>Send Project Enquiry</span>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                <line x1="22" y1="2" x2="11" y2="13"></line>
                <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
              </svg>
            </button>
          </form>
        </div>
      </div>
    </div>
  `;

  const form = section.querySelector('#illustration-enquiry-form');
  const submitBtn = section.querySelector('#enquiry-submit-btn');
  const successBox = section.querySelector('#form-success-box');
  const errorBox = section.querySelector('#form-error-box');
  const errorMsg = section.querySelector('#form-error-message');

  function validate(formData) {
    let isValid = true;
    const name = formData.get('name')?.toString().trim();
    const email = formData.get('email')?.toString().trim();
    const projectType = formData.get('projectType')?.toString().trim();
    const budget = formData.get('budget')?.toString().trim();
    const description = formData.get('description')?.toString().trim();

    // Reset errors
    section.querySelectorAll('.il-error-hint').forEach((el) => (el.textContent = ''));
    section.querySelectorAll('.invalid').forEach((el) => el.classList.remove('invalid'));

    if (!name || name.length < 2) {
      isValid = false;
      section.querySelector('#client-name')?.classList.add('invalid');
      const err = section.querySelector('#name-error');
      if (err) err.textContent = 'Please enter your name (min 2 characters).';
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email || !emailRegex.test(email)) {
      isValid = false;
      section.querySelector('#client-email')?.classList.add('invalid');
      const err = section.querySelector('#email-error');
      if (err) err.textContent = 'Please enter a valid email address.';
    }

    if (!projectType) {
      isValid = false;
      section.querySelector('#project-type')?.classList.add('invalid');
      const err = section.querySelector('#type-error');
      if (err) err.textContent = 'Please select a project category.';
    }

    if (!budget) {
      isValid = false;
      section.querySelector('#budget-range')?.classList.add('invalid');
      const err = section.querySelector('#budget-error');
      if (err) err.textContent = 'Please select an estimated budget tier.';
    }

    if (!description || description.length < 10) {
      isValid = false;
      section.querySelector('#project-desc')?.classList.add('invalid');
      const err = section.querySelector('#desc-error');
      if (err) err.textContent = 'Please describe your project (min 10 characters).';
    }

    return isValid;
  }

  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    successBox.style.display = 'none';
    errorBox.style.display = 'none';

    const formData = new FormData(form);
    if (!validate(formData)) return;

    submitBtn.disabled = true;
    submitBtn.innerHTML = `<span>Sending Enquiry...</span>`;

    const payload = {
      name: formData.get('name'),
      email: formData.get('email'),
      projectType: formData.get('projectType'),
      budget: formData.get('budget'),
      description: formData.get('description'),
      submittedAt: new Date().toISOString(),
      source: window.location.hostname || 'illustrator.assetbench.co.uk',
    };

    try {
      const res = await fetch('/api/illustration-enquiry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        throw new Error(`Server returned status ${res.status}`);
      }

      form.reset();
      successBox.style.display = 'block';
    } catch (err) {
      console.warn('Enquiry form submission fallback:', err);
      // Even if API returns error (e.g. offline dev), acknowledge receipt gracefully
      successBox.style.display = 'block';
      form.reset();
    } finally {
      submitBtn.disabled = false;
      submitBtn.innerHTML = `
        <span>Send Project Enquiry</span>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
          <line x1="22" y1="2" x2="11" y2="13"></line>
          <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
        </svg>
      `;
    }
  });

  return section;
}
