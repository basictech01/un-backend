#!/bin/bash

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}🚀 Running Un-Backend Article Management Tests...${NC}\n"

# Check if Newman is installed
if ! command -v newman &> /dev/null; then
    echo -e "${RED}❌ Newman not found. Installing globally...${NC}"
    npm install -g newman
    if [ $? -ne 0 ]; then
        echo -e "${RED}❌ Failed to install Newman${NC}"
        exit 1
    fi
fi

# Check if Newman HTML reporter is installed
if ! npm list -g newman-reporter-html &> /dev/null; then
    echo -e "${YELLOW}📦 Installing Newman HTML reporter...${NC}"
    npm install -g newman-reporter-html
    if [ $? -ne 0 ]; then
        echo -e "${YELLOW}⚠️  HTML reporter installation failed. Continuing without HTML report...${NC}"
    fi
fi

# Get the directory where this script is located
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

# Define paths
COLLECTION="$SCRIPT_DIR/collection.json"
ENVIRONMENT="$SCRIPT_DIR/environment.json"
REPORT="$SCRIPT_DIR/test-report.html"

# Verify files exist
if [ ! -f "$COLLECTION" ]; then
    echo -e "${RED}❌ Collection file not found: $COLLECTION${NC}"
    exit 1
fi

if [ ! -f "$ENVIRONMENT" ]; then
    echo -e "${RED}❌ Environment file not found: $ENVIRONMENT${NC}"
    exit 1
fi

echo -e "${YELLOW}📋 Collection:${NC} $COLLECTION"
echo -e "${YELLOW}🌍 Environment:${NC} $ENVIRONMENT"
echo -e "${YELLOW}📊 Report output:${NC} $REPORT\n"

# Run Newman with CLI reporter
newman run "$COLLECTION" \
  --environment "$ENVIRONMENT" \
  --reporters cli,html \
  --reporter-html-export "$REPORT" \
  --timeout-request 10000 \
  --timeout 30000 \
  --bail

STATUS=$?

echo ""
echo "════════════════════════════════════════════════════════════════"

if [ $STATUS -eq 0 ]; then
    echo -e "${GREEN}✅ All tests passed!${NC}"
    echo -e "${GREEN}📊 HTML report generated:${NC} $REPORT"
    exit 0
else
    echo -e "${RED}❌ Tests failed with exit code: $STATUS${NC}"
    echo -e "${RED}📊 Check HTML report for details:${NC} $REPORT"
    exit 1
fi
