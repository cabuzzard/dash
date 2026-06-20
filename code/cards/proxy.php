<?php
// ============================================================
//  PASTE YOUR ANTHROPIC API KEY BELOW
// ============================================================
$ANTHROPIC_API_KEY = "ntn_C8452809915b7aOiGkLvtkgHnmAA5v1Dt4OCeEXtHCU6FS";
// ============================================================

header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type");
header("Content-Type: application/json");

if ($_SERVER["REQUEST_METHOD"] === "OPTIONS") {
    http_response_code(200);
    exit();
}

if ($_SERVER["REQUEST_METHOD"] !== "POST") {
    http_response_code(405);
    echo json_encode(["error" => "Method not allowed"]);
    exit();
}

$input = json_decode(file_get_contents("php://input"), true);
if (!$input) {
    http_response_code(400);
    echo json_encode(["error" => "Invalid JSON"]);
    exit();
}

$action = $input["action"] ?? "";

// ── ACTION: get_page ─────────────────────────────────────
// Fetches a Notion page's child blocks via Notion REST API
if ($action === "get_page") {
    $pageId = $input["page_id"] ?? "";
    $notionToken = $input["notion_token"] ?? "";
    if (!$pageId || !$notionToken) {
        http_response_code(400);
        echo json_encode(["error" => "Missing page_id or notion_token"]);
        exit();
    }

    // Get child blocks of the page
    $url = "https://api.notion.com/v1/blocks/" . $pageId . "/children?page_size=100";
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HTTPHEADER => [
            "Authorization: Bearer " . $notionToken,
            "Notion-Version: 2022-06-28",
            "Content-Type: application/json",
        ],
        CURLOPT_TIMEOUT => 30,
    ]);
    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    http_response_code($httpCode);
    echo $response;
    exit();
}

// ── ACTION: ask_claude ───────────────────────────────────
// Sends a prompt to Claude (no MCP) and returns the response
if ($action === "ask_claude") {
    $messages = $input["messages"] ?? [];
    $system   = $input["system"] ?? "";
    if (!$messages) {
        http_response_code(400);
        echo json_encode(["error" => "Missing messages"]);
        exit();
    }

    $payload = [
        "model"      => "claude-sonnet-4-20250514",
        "max_tokens" => 1000,
        "messages"   => $messages,
    ];
    if ($system) $payload["system"] = $system;

    $ch = curl_init("https://api.anthropic.com/v1/messages");
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_POST           => true,
        CURLOPT_POSTFIELDS     => json_encode($payload),
        CURLOPT_HTTPHEADER     => [
            "Content-Type: application/json",
            "x-api-key: " . $ANTHROPIC_API_KEY,
            "anthropic-version: 2023-06-01",
        ],
        CURLOPT_TIMEOUT => 60,
    ]);
    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $error    = curl_error($ch);
    curl_close($ch);

    if ($error) {
        http_response_code(500);
        echo json_encode(["error" => "cURL error: " . $error]);
        exit();
    }
    http_response_code($httpCode);
    echo $response;
    exit();
}

http_response_code(400);
echo json_encode(["error" => "Unknown action"]);
