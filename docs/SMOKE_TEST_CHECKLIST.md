# VoiceLoop smoke test checklist

A by-hand check of the whole app on your own computer, before deploying. Work top to bottom. Each step has **Do** (what to click or type) and **See** (what should happen). If what you see is different, stop and note the step number.

📱 = needs a real phone. Everything else is done on the computer.

**You need:** the computer with VoiceLoop on it, two browser windows (a normal one and a private/incognito one), a phone on the same Wi-Fi, and the Super Admin email and password.

---

## A. Start the app

1. **Do:** open a terminal in the `VoiceLoop` folder, type `cd server` then `npm run dev`.
   **See:** lines starting `Email:`, `Retention: feedback is deleted automatically after 45 days` and `Server listening on http://localhost:5000`, with no red errors.
2. **Do:** open a second terminal in the `VoiceLoop` folder, type `cd client` then `npm run dev -- --host`.
   **See:** two addresses: `Local: http://localhost:5173/` and `Network: http://192.168.x.x:5173/`. Write down the Network one.
3. **Do:** if Windows asks to allow Node.js on the network, click **Allow** (private networks).
   **See:** the prompt closes.
4. **Do:** in the normal browser, open the **Network** address from step 2 (not `localhost`), so QR codes work on the phone.
   **See:** the VoiceLoop landing page.

Keep both terminals open the whole time. The server terminal is where "emails" appear.

## B. Super Admin login

5. **Do:** click **Log in**, enter the Super Admin email and password, click **Log in**.
   **See:** the **Accounts** page with summary cards (Pending requests, Active, …) and a table or "No pending requests".

## C. Sign up a test owner (private window)

6. **Do:** open a private window, go to the same Network address, click **Request access**.
   **See:** the "Request access" form.
7. **Do:** fill in Your name `Test Owner`, Business name `Test Cafe`, an email you control, a password of 10+ characters, click **Request access**.
   **See:** "Your account has been created." and the **Waiting for approval** screen with a "Pending review" label.
8. **Do:** in the private window's address bar, add `/app/dashboard` after the address and press Enter.
   **See:** you are sent back to the Waiting for approval screen.

## D. Approve for 7 days (Super Admin window)

9. **Do:** reload the Accounts page.
   **See:** Pending requests shows 1; "Test Cafe" has a yellow "Pending" pill, a yellow stripe and an **Approve** button. No password is shown anywhere.
10. **Do:** click **Approve**, choose **7 days**, click **Approve access**.
    **See:** a green message "Approved …: access until <date 7 days from now>"; the row shows Active and "7 days left".

## E. Owner first login, Settings, Links and QR (private window)

11. **Do:** click **Check status**.
    **See:** the **Set up your business** page.
12. **Do:** fill in the business name and anything optional, then submit.
    **See:** the Dashboard with a "set up" message and "No feedback yet".
13. **Do:** click the **gear** icon (Settings) in the left rail.
    **See:** Business card on the left, Customer page wording with a phone preview on the right.
14. **Do:** change Business name, add a Google review link starting with `https://` (e.g. `https://g.page/r/test/review`), click **Save changes**.
    **See:** "Settings saved." and the new name at the top of the page.
15. **Do:** type new text in both card-text boxes, watch the phone preview, click **Save wording**.
    **See:** the preview changes as you type; then "Wording saved."
16. **Do:** click the **QR** icon (Links & QR codes), click **New link**, name it `Table 4`, save.
    **See:** "Created "Table 4"." and a new card with a QR code on a white tile.
17. **Do:** on the Table 4 card click **Download PNG**, then **Copy**.
    **See:** a PNG file downloads; the Copy button shows "Copied".

## F. Public page on the phone 📱

18. 📱 **Do:** open the phone camera and scan the Table 4 QR code (on screen or from the PNG).
    **See:** the phone opens a VoiceLoop page with the business name.
19. 📱 **Do:** look at the page.
    **See:** two cards: **Google Review / Yes! Why not** and **Complaint/Personal Feedback / Suggest**.
20. 📱 **Do:** tap **Yes! Why not**.
    **See:** your Google review link opens in a new tab. Go back.
21. 📱 **Do:** tap **Suggest**, keep "General", type a short message, tap **Send feedback**.
    **See:** a green check and "Thank you!".
22. 📱 **Do:** reload the page, tap **Suggest**, choose **Complaint or issue**, type a message, leave name and email empty, tap **Send feedback**.
    **See:** "Thank you!".
23. 📱 **Do:** reload, tap **Suggest**, tap **Record voice**.
    **See:** on the phone this shows "Voice recording needs a secure (https) connection…" with **Write instead**. That is expected over Wi-Fi without https; the next step records on the computer.

## G. Voice feedback (computer)

24. **Do:** in the normal window, open `http://localhost:5173/f/` followed by the business's slug (copy it from Settings → Public feedback link), tap **Suggest**, choose **Record voice**, click the round microphone button, allow the microphone.
    **See:** "Recording", a running timer and moving bars.
25. **Do:** speak for about 10 seconds, click **Stop recording**, press play.
    **See:** "Your recording · 0:10" and you hear yourself.
26. **Do:** click **Send recording**.
    **See:** an upload bar, then "Thank you!".

## H. Inbox (private window, owner)

27. **Do:** click the **inbox** icon (Feedback).
    **See:** cards New, Open complaints, In progress, Resolved, Voice with numbers; the list shows your 3 items, newest first.
28. **Do:** click the **Open complaints** card, then click it again.
    **See:** only the complaint shows; then all 3 again.
29. **Do:** use **Type → Voice**, then **Category → Complaint**, then **Clear all filters**.
    **See:** the list narrows each time, then all 3 return.
30. **Do:** click the voice item, press the round play button.
    **See:** the recording plays; the dashed box says "Transcription isn't available…".
31. **Do:** click the complaint.
    **See:** it still shows "New" and "Open" (just opening it changes nothing).
32. **Do:** type a note under Internal notes, click **Add note**.
    **See:** the note appears with your name and time.
33. **Do:** click **Mark as reviewed**.
    **See:** the button changes to "Mark as new"; the row's dot turns grey.
34. **Do:** click **Start working on it**, then **Resolve…**, type a summary, click **Mark resolved**.
    **See:** the pill goes amber "In progress", then green "Resolved" with your summary; History lists each change.
35. **Do:** click **Export CSV**.
    **See:** a CSV file downloads with your items (open it: no notes in it).
36. **Do:** open the General item, click **Delete feedback**, then **Delete permanently**.
    **See:** "The feedback was permanently deleted." and it is gone from the list.

## I. Dashboard and Analytics (owner)

37. **Do:** click the **dashboard** icon.
    **See:** tiles with real numbers, a 30-day chart, and "Latest feedback" listing your items.
38. **Do:** click an item in Latest feedback.
    **See:** the inbox opens with that item shown.
39. **Do:** click the **chart** icon (Analytics), click **7 days**, then **30 days**.
    **See:** totals and charts that match your items; nothing invented.

## J. Passwords

40. **Do:** in the private window, log out (bottom of the left rail), click **Log in → Forgot password?**, enter the owner email, click **Send reset link**.
    **See:** "Check your email".
41. **Do:** look at the **server** terminal.
    **See:** a block "[email] ---- development email (not sent) ----" with a reset link.
42. **Do:** copy that link into the private window, choose a new password, save; then log in with it.
    **See:** a success message, and the new password works.
43. **Do:** as Super Admin, on Test Cafe click **More → Reset link → Create link → Copy**, then **Done**.
    **See:** a link with "won't be shown again" and an expiry time; no email is printed in the server terminal.
44. **Do:** open that link in the private window and set another new password.
    **See:** it works once; opening the same link again says it has expired or is invalid.

## K. Extend, suspend, reactivate (Super Admin)

45. **Do:** on Test Cafe click **Extend**, choose **30 days**, click **Extend access**.
    **See:** the end date moves out; about 30 days left.
46. **Do:** click **More → Suspend**, type a reason, click **Suspend account**.
    **See:** the pill turns red "Suspended".
47. **Do:** in the private window (owner), click any page in the left rail.
    **See:** the **Account suspended** screen. 📱 The phone's feedback page now says "This feedback page isn't available".
48. **Do:** as Super Admin click **Reactivate**, choose a period, click **Reactivate**.
    **See:** Active again; the owner can use the dashboard and the phone page works after reloading.

## L. Delete the test account

49. **Do:** as Super Admin, on Test Cafe click **More → Delete**, type a wrong name.
    **See:** the "Delete account permanently" dialog; **Delete permanently** stays disabled.
50. **Do:** type the exact name shown in bold, click **Delete permanently**.
    **See:** "Deleted … permanently"; Test Cafe is gone from the list.
51. **Do:** in the private window, reload; 📱 reload the phone page.
    **See:** the owner is logged out / can't get in; the phone page says "isn't available".
52. **Do:** as Super Admin click the **log** icon (Audit log).
    **See:** a card for the test account with a grey "Deleted" pill; clicking it shows "Deleted account" and the earlier approvals, suspension and reset link.

## M. 45-day retention dry run

53. **Do:** open a third terminal in the `VoiceLoop` folder, type `cd server` then `node scripts/run-retention.js --dry-run`.
    **See:** "Dry run: would delete … feedback item(s) and … audio file(s) … Nothing was deleted."

## N. Light and dark mode

54. **Do:** on each area (landing, log in, owner dashboard, inbox, settings, links, analytics, Super Admin accounts, audit log), switch the theme: the round switch in the left rail, the top-right of login pages, or the landing header.
    **See:** light = white/grey with teal buttons; dark = navy with gold buttons. All text stays readable; nothing disappears.
55. 📱 **Do:** switch the phone between light and dark in its own settings, then reload the public feedback page.
    **See:** the page follows the phone's setting (it has no switch of its own).
56. **Do:** reload a page after switching.
    **See:** it keeps the theme you chose with no flash of the other one.

## O. Phone width 📱

57. 📱 **Do:** on the phone, open the Network address, log in as the owner (recreate one if you deleted it) and visit Dashboard, Feedback, Links, Settings, Analytics using the ☰ menu.
    **See:** everything fits the screen; no sideways scrolling; the menu slides in from the left and closes when you tap an item.
58. 📱 **Do:** in Feedback, tap an item, then **← Feedback**.
    **See:** the item opens full screen and the back link returns to the list.

**Done.** If every **See** matched, the app is ready for the deployment steps in `docs/HANDOVER.md` section 6.
