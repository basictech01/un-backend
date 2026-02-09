# 🚀 Quick Start - Complete App Tests in 30 seconds

## Step 1: Install Newman (one-time)

```bash
npm install -g newman
```

## Step 2: Start Your Backend

In another terminal:

```bash
cd ..
npm run dev
```

Wait until you see: `Server running on port 3000`

## Step 3: Run Tests

### On Linux/Mac/WSL:

```bash
cd tests
chmod +x run-tests.sh
./run-tests.sh
```

### On Windows (Command Prompt):

```bash
cd tests
run-tests.bat
```

### On Windows (Git Bash / PowerShell):

```bash
cd tests
bash run-tests.sh
```

### Direct Newman (any OS):

```bash
cd tests
newman run collection.json --environment environment.json --reporters cli
```

---

## ✅ Success = All Tests Pass

You'll see:

```
□ 1. Authentication & User Signup
└ Signup Author 1
  √ Author 1 signup successful
└ Signup Author 2
  √ Author 2 signup successful
└ Signup Invalid Email (Should Fail)
  √ Invalid signup rejected

□ 2. Auth Token & Profile Access
└ Get Current User (me)
  √ Get current user successful
└ Get User Without Auth (Should Fail)
  √ Unauthorized request rejected
└ Refresh Token
  √ Refresh token successful

□ 3. User Profile Management
└ Update Own Profile
  √ Profile updated successfully
└ Update Profile Photo
  √ Profile photo updated
└ Get All Authors
  √ Authors list retrieved

□ 4. Article Creation
└ Create Draft Article
  √ Draft article created
└ Create Invalid Section (Should Fail)
  √ Invalid section rejected

□ 5. Article Management
└ Update Draft Article
  √ Article updated
└ Submit Article for Review
  √ Article submitted for review
└ Get Approved Articles
  √ Approved articles retrieved
└ Get My Articles
  √ My articles retrieved
└ Search Articles by Author
  √ Search returned results or empty

□ 6. Permission & Access Control
└ Create Draft for Deletion
  √ Draft article for deletion created
└ Non-Owner Cannot Update Article
  √ Non-owner rejected
└ Unauthenticated Article Creation (Should Fail)
  √ Unauthorized request rejected
└ Delete Own Draft Article
  √ Article deleted
└ Author Cannot Access Admin Operations
  √ Admin operation rejected for author

□ 7. Article Trending & Views
└ Increment Article Views
  √ Views incremented
└ Get Trending Articles
  √ Trending articles retrieved

Requests: 23, 0 failed
Time: 1.867 s

✅ All tests passed!
```

---

## 📊 View Detailed Report

After tests run, open:

```
tests/test-report.html
```

in your browser for:
- ✅ All passed tests
- ⏱️ Response times
- 🔍 Full request/response bodies
- 📈 Statistics

---

## ❌ If Tests Fail

### Server not running?

```bash
cd ..
npm run dev
# Wait 5 seconds for startup
```

### Newman not installed?

```bash
npm install -g newman
newman -v  # Should print version
```

### Wrong endpoint?

Check `environment.json`:

```json
{
  "base_url": "http://localhost:3000",
  "graphql_endpoint": "http://localhost:3000/graphql"
}
```

Must match your running server's URL.

---

## 🎯 Common Commands

| Task | Command |
|------|---------|
| Run all tests | `run-tests.sh` (Mac/Linux) or `run-tests.bat` (Windows) |
| View report | `open tests/test-report.html` (Mac) or `start tests/test-report.html` (Windows) |
| Run one folder | `newman run collection.json --folder "Auth Setup"` |
| Increase timeout | Add `--timeout-request 20000` to newman command |
| Add auth header | Already handled by collection (auto-saved tokens) |

---

## 📝 What Gets Tested

**User Management:**
✅ User signup with email validation
✅ Get current user profile (me query)
✅ Refresh authentication tokens
✅ Update user profile (bio, profession, photo)
✅ Get all authors list
✅ Auth checks (unauthorized access rejected)

**Article Management:**
✅ Create articles in draft status
✅ Update articles (title, content, section, subsections)
✅ Submit articles for review (draft → pending)
✅ Query approved articles with pagination
✅ Query user's own articles (all statuses)
✅ Search articles by author/title/section/content
✅ Delete draft articles
✅ Get trending articles by view count
✅ Increment article view count

**Permission & Access Control:**
✅ Non-owners cannot update articles
✅ Unauthenticated requests rejected
✅ Authors cannot access admin operations
✅ Authors can only delete their own drafts

**Total: 23 test cases across 7 test suites**

---

## 💡 Pro Tips

1. **Modify tests in Postman UI:**
   - Import `collection.json` in Postman Desktop
   - Edit requests/tests visually
   - Export back to `collection.json`

2. **Add to CI/CD:**
   - Copy `.sh` file to GitHub Actions
   - Tests automatically run on push

3. **Share with team:**
   - Commit `collection.json` + `environment.json`
   - Each dev runs `run-tests.sh`
   - Everyone tests the same endpoints

4. **Debug a failing test:**
   ```bash
   newman run collection.json --verbose
   ```

---

**That's it! Happy testing 🎉**

For more info, see `README.md`
