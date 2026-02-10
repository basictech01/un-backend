# Un-Backend Complete App - Postman Test Suite

Complete end-to-end test suite for user management and article management APIs using Postman and Newman.

## 📁 Files

- `collection.json` - Postman collection with 23 complete app tests (user management + article management)
- `environment.json` - Environment variables (base URL, tokens, user IDs, article IDs)
- `run-tests.sh` - Newman script to run all tests automatically (Linux/Mac/WSL)
- `run-tests.bat` - Newman script to run all tests automatically (Windows CMD)
- `test-report.html` - Generated test report (after running tests)
- `README.md` - Complete documentation
- `QUICKSTART.md` - 30-second quick start guide

## 🚀 Quick Start

### 1. Install Newman (One-time setup)

```bash
npm install -g newman
```

Check installation:

```bash
newman -v
```

### 2. Start Your Server

Make sure the backend is running:

```bash
cd ..
npm run dev
# or
npm start
```

Server should be at: `http://localhost:3000`

### 3. Run All Tests

From this `tests/` directory:

**On Linux/Mac/WSL:**

```bash
chmod +x run-tests.sh
./run-tests.sh
```

**On Windows (Git Bash):**

```bash
bash run-tests.sh
```

**Direct Newman command:**

```bash
newman run collection.json --environment environment.json --reporters cli
```

## 📊 Test Results

### CLI Output

Tests will print results to terminal showing all 7 test suites:

```
□ 1. Authentication & User Signup
  └ Signup Author 1 [200 OK, 226ms]
    √ Author 1 signup successful
  └ Signup Author 2 [200 OK, 210ms]
    √ Author 2 signup successful
  └ Signup Invalid Email (Should Fail) [200 OK, 4ms]
    √ Invalid signup rejected

□ 2. Auth Token & Profile Access
  └ Get Current User (me) [200 OK, 6ms]
    √ Get current user successful
  ... (18 more tests)

Requests: 23, 0 failed
Time: 1.867 s

✅ All tests passed!
```

### HTML Report

After running tests, a detailed HTML report is generated:

```
tests/test-report.html
```

Open in browser to see:
- ✅ Passed tests (green)
- ❌ Failed tests (red) with error details
- Response times
- Assertions breakdown

## 🧪 Test Structure

**23 Total Tests** organized in 7 test suites:

### 1. Authentication & User Signup

```
✓ Signup Author 1
✓ Signup Author 2
✓ Signup Invalid Email (Should Fail)
```

Tests user registration with validation. Creates two test users and saves their JWT tokens to environment variables.

### 2. Auth Token & Profile Access

```
✓ Get Current User (me)
✓ Get User Without Auth (Should Fail)
✓ Refresh Token
```

Tests authentication token management and protected profile access.

### 3. User Profile Management

```
✓ Update Own Profile
✓ Update Profile Photo
✓ Get All Authors
```

Tests user profile updates (bio, profession, photo) and author discovery.

### 4. Article Creation

```
✓ Create Draft Article
✓ Create Invalid Section (Should Fail)
```

Tests article creation with validation for sections and subsections.

### 5. Article Management

```
✓ Update Draft Article
✓ Submit Article for Review
✓ Get Approved Articles
✓ Get My Articles
✓ Search Articles by Author
```

Tests full article lifecycle: create → update → submit → query with pagination and search.

### 6. Permission & Access Control

```
✓ Create Draft for Deletion
✓ Non-Owner Cannot Update Article
✓ Unauthenticated Article Creation (Should Fail)
✓ Delete Own Draft Article
✓ Author Cannot Access Admin Operations
```

Tests permission checks and authorization controls across articles and users.

### 7. Article Trending & Views

```
✓ Increment Article Views
✓ Get Trending Articles
```

Tests view tracking and trending articles by popularity.

## 🔧 How to Add More Tests

### Example: Add a new test request

1. **In Postman UI** (easiest):
   - Import `collection.json` in Postman Desktop app
   - Add new request to a folder
   - Click "Tests" tab and add assertions:

```javascript
pm.test("Status is 200", function () {
  pm.expect(pm.response.code).to.equal(200);
});

pm.test("Response has data", function () {
  pm.expect(pm.response.json().data).to.exist;
});
```

   - Save and export collection as JSON
   - Replace `collection.json` with your updated version

2. **Directly in JSON** (for advanced users):
   - Edit `collection.json`
   - Find the request item you want to modify
   - Add/update the `"event"` array with test scripts

### Example: Use variables between tests

Set a variable after successful response:

```javascript
pm.environment.set('variable_name', pm.response.json().data.id);
```

Use in next request:

```javascript
"body": {
  "mode": "raw",
  "raw": "{\"query\": \"query { getArticle(id: {{variable_name}}) { ... } }\"}"
}
```

## 🔐 Authentication

### How tokens work:

1. **Signup Author 1** saves token → `author1_token` environment variable
2. **Signup Author 2** saves token → `author2_token` environment variable
3. All protected requests use `Authorization: Bearer {{author1_token}}` header
4. **Refresh Token** mutation renews auth tokens

### Dynamic Email Generation:

Emails are auto-generated with timestamps to avoid duplicates:
- Email: `author1-{{$timestamp}}@test.com`
- Each test run creates unique users automatically

## ⚙️ Environment Variables

Edit `environment.json` to configure:

```json
{
  "base_url": "http://localhost:3000",
  "graphql_endpoint": "http://localhost:3000/graphql",
  "author1_token": "",        // Auto-filled by Author 1 signup
  "author1_refresh_token": "", // Auto-filled by Author 1 signup
  "author1_id": "",           // Auto-filled by Author 1 signup
  "author2_token": "",        // Auto-filled by Author 2 signup
  "author2_id": "",           // Auto-filled by Author 2 signup
  "article_id": "",           // Auto-filled by create article
  "article_delete_id": ""     // Auto-filled by delete test
}
```

### For production testing:

```json
{
  "base_url": "https://api.production.com",
  "graphql_endpoint": "https://api.production.com/graphql"
}
```

Then run:

```bash
newman run collection.json --environment environment-prod.json
```

## 📖 Postman UI Import

To edit tests in Postman Desktop app:

1. **Open Postman**
2. **Collection** → **Import**
3. Select `collection.json`
4. Select `environment.json` to use
5. Edit requests/tests in UI
6. Export collection back to `collection.json`

## 🔄 CI/CD Integration

### GitHub Actions

```yaml
name: API Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: 18

      - name: Start server
        run: npm run dev &
        working-directory: .

      - name: Wait for server
        run: sleep 5

      - name: Run API tests
        run: bash tests/run-tests.sh
```

### GitLab CI

```yaml
api_tests:
  script:
    - npm install -g newman
    - npm run dev &
    - sleep 5
    - bash tests/run-tests.sh
  artifacts:
    paths:
      - tests/test-report.html
```

## 🐛 Troubleshooting

### "Newman not found"

```bash
npm install -g newman
```

### "Server not running"

```bash
cd ..
npm run dev
# Wait for "Server running on port 3000"
```

### "Unauthorized access"

- Auth tokens expired
- Run tests again (signup will refresh tokens)

### Tests timeout

Increase timeout in `run-tests.sh`:

```bash
--timeout-request 20000  # 20 seconds per request
```

### GraphQL query syntax error

Check JSON escaping in `collection.json`:
- Use `\\\"` for quotes inside strings
- Use `\\n` for newlines

## 📚 GraphQL Test Examples

### Query with variables

```javascript
{
  "query": "query GetArticle($id: Int!) { article(id: $id) { id title } }",
  "variables": { "id": 123 }
}
```

### Mutation test

```javascript
pm.test("Created article has ID", function () {
  const res = pm.response.json();
  pm.expect(res.data.createArticle.id).to.be.a('number');
});
```

### Check for GraphQL errors

```javascript
pm.test("No GraphQL errors", function () {
  const res = pm.response.json();
  pm.expect(res.errors).to.be.undefined;
});
```

## ✅ Passing All Tests

When all tests pass, you'll see:

```
Requests: 23, 0 failed
Time: 1.867 s

═════════════════════════════════════════════════
✅ All tests passed!
📊 HTML report generated: tests/test-report.html
```

**Test Coverage:**
- 166 Jest unit + integration tests (user management and article management)
- 23 Postman end-to-end tests (complete app workflows)
- **Total: 189 comprehensive tests**

## 🤝 Support

For issues:
1. Check the HTML report: `tests/test-report.html`
2. Run single test: `newman run collection.json --folder "1. Auth Setup"`
3. Check server logs: `npm run dev`
4. Verify environment: `cat tests/environment.json`

---

**Happy testing! 🎉**
