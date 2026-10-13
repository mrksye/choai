{-# LANGUAGE OverloadedStrings #-}

module Main (main) where

import Control.Monad (unless, forM_)
import qualified Data.Text as T
import qualified Data.Text.IO as T
import Hledger
import NativeReport
import System.Directory (getDirectoryContents)
import System.Exit (exitFailure)
import System.FilePath ((</>))
import System.IO (hPutStrLn, stderr)
import System.IO.Temp (withSystemTempDirectory)

-- | Native execution smoke tests also check that refused commands leave the
-- input directory byte-for-byte unchanged and do not create .latest files.
main :: IO ()
main = withSystemTempDirectory "choai-reports" $ \dir -> do
  let path = dir </> "main.journal"
      contents = "2026-01-01 Purchase\n    expenses:food  12 EUR  ; project:alpha\n    assets:bank\n"
  T.writeFile path contents
  read <- runExceptT (readJournalFile definputopts path)
  case read of
    Left detail -> hPutStrLn stderr detail >> exitFailure
    Right journal -> do
      forM_ ["balance expenses --pivot=project --monthly", "hledger bal expenses -M", "register expenses", "tags --values project", "balance expenses -O txt", "balance expenses --alias expenses=costs"] $ \command -> do
        answer <- nativeReport journal command
        check (either (const False) (const True) answer) ("Failed command: " <> T.unpack command <> ": " <> show answer)
      forM_ ["add", "import", "run", "balance -o overwritten", "balance -f other.journal", "print --new", "balance --debug", "balance --unknown-option"] $ \command -> do
        answer <- nativeReport journal command
        check (either (const True) (const False) answer) ("Accepted unsafe command: " <> T.unpack command)
      after <- T.readFile path
      files <- getDirectoryContents dir
      check (after == contents && all (`elem` [".", "..", "main.journal"]) files) "A report changed the input book."

check :: Bool -> String -> IO ()
check True _ = pure ()
check False detail = hPutStrLn stderr detail >> exitFailure
