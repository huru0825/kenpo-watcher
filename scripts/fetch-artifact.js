#!/usr/bin/env node
/**
 * GitHub Actions の最新アーティファクトをダウンロード＆解凍するスクリプト
 * - axios: HTTP リクエスト用
 * - unzipper: ZIP を解凍
 */

const fs = require('fs')
const path = require('path')
const axios = require('axios')
const unzipper = require('unzipper')

// GitHub レポジトリ情報
const REPO = 'huru825/kenpo-watcher'  // ← 自分のユーザー名/リポ名に書き換え
const TOKEN = process.env.GITHUB_TOKEN

if (!TOKEN) {
  console.error('Error: GITHUB_TOKEN が設定されていません')
  process.exit(1)
}

;(async () => {
  try {
    console.log('🔍 アーティファクト一覧を取得中...')
    const listRes = await axios.get(
      `https://api.github.com/repos/${REPO}/actions/artifacts`,
      { headers: { Authorization: `token ${TOKEN}` } }
    )
    const artifacts = listRes.data.artifacts
    if (!artifacts || artifacts.length === 0) {
      console.error('Error: アーティファクトが見つかりません')
      process.exit(1)
    }

    const { id, archive_download_url: url } = artifacts[0]
    console.log(`⬇️ ID=${id} の ZIP をダウンロード中...`)

    const zipRes = await axios.get(url, {
      headers: { Authorization: `token ${TOKEN}` },
      responseType: 'stream'
    })

    await new Promise((resolve, reject) => {
      zipRes.data
        .pipe(unzipper.Extract({ path: process.cwd() }))
        .on('close', resolve)
        .on('error', reject)
    })

    console.log('✅ アーティファクトを展開しました')
  } catch (e) {
    console.error('Error:', e.message)
    process.exit(1)
  }
})()
