{-# LANGUAGE OverloadedStrings #-}

-- | Run read-only commands with upstream's option parsers, transformations and
-- renderers. The host captures stdout; no command can select an output file or
-- another input book, and the parsed journal held by Bindings is never replaced.
module NativeReport (nativeReport) where

import Control.Exception (SomeException, displayException, try)
import Data.List (find)
import Data.Text (Text)
import qualified Data.Text as T
import System.Console.CmdArgs.Explicit (Mode(..), process)
import System.IO (hFlush, stdout)

import Hledger
import Hledger.Cli.CliOptions
import Hledger.Cli.Utils (journalTransform)
import Hledger.Cli.Commands.Accounts
import Hledger.Cli.Commands.Activity
import Hledger.Cli.Commands.Aregister
import Hledger.Cli.Commands.Balance
import Hledger.Cli.Commands.Balancesheet
import Hledger.Cli.Commands.Balancesheetequity
import Hledger.Cli.Commands.Cashflow
import Hledger.Cli.Commands.Codes
import Hledger.Cli.Commands.Commodities
import Hledger.Cli.Commands.Descriptions
import Hledger.Cli.Commands.Files
import Hledger.Cli.Commands.Incomestatement
import Hledger.Cli.Commands.Notes
import Hledger.Cli.Commands.Payees
import Hledger.Cli.Commands.Prices
import Hledger.Cli.Commands.Print
import Hledger.Cli.Commands.Register
import Hledger.Cli.Commands.Roi
import Hledger.Cli.Commands.Stats
import Hledger.Cli.Commands.Tags

-- | The closed list excludes writers, external programs, the REPL and commands
-- which open other books. Aliases and option syntax remain upstream's.
commands :: [(Mode RawOpts, CliOpts -> Journal -> IO (), Bool)]
commands =
  [ (accountsmode, accounts, False)
  , (activitymode, activity, False)
  , (aregistermode, aregister, True)
  , (balancemode, balance, True)
  , (balancesheetmode, balancesheet, True)
  , (balancesheetequitymode, balancesheetequity, True)
  , (cashflowmode, cashflow, True)
  , (codesmode, codes, False)
  , (commoditiesmode, commodities, False)
  , (descriptionsmode, descriptions, False)
  , (filesmode, files, False)
  , (incomestatementmode, incomestatement, True)
  , (notesmode, notes, False)
  , (payeesmode, payees, False)
  , (pricesmode, prices, False)
  , (printmode, print', True)
  , (registermode, register, True)
  , (roimode, roi, False)
  , (statsmode, stats, False)
  , (tagsmode, tags, False)
  ]

-- | Exceptions raised by upstream's CLI parser are ordinary command failures,
-- not a dead engine. stdout is flushed before the host reads its capture.
nativeReport :: Journal -> Text -> IO (Either Text Text)
nativeReport journal command = do
  attempted <- try (runNativeReport journal command) :: IO (Either SomeException (Either Text Text))
  hFlush stdout
  pure $ either (Left . T.pack . displayException) id attempted

runNativeReport :: Journal -> Text -> IO (Either Text Text)
runNativeReport journal command =
  case dropExecutable (filter (not . null) (words' (T.unpack (T.strip command)))) of
    [] -> pure (Left "Enter an hledger report command.")
    name : args -> case find (\(mode, _, _) -> name `elem` modeNames mode) commands of
      Nothing -> pure (Left ("Not a read-only report command: " <> T.pack name))
      Just (mode, action, html) ->
        case process mode (ensureDebugFlagHasVal (replaceNumericFlags args)) of
          Left detail -> pure (Left (T.pack detail))
          Right raw -> case refusedOptions raw of
            option : _ -> pure (Left ("Not available for a report on the open book: --" <> T.pack option))
            [] -> do
              let format = maybe (if html then "html" else "txt") id (maybestringopt "output-format" raw)
                  isolated = setopt "color" "no" (setopt "pager" "no" (setopt "output-format" format raw))
              opts <- rawOptsToCliOpts isolated
              action opts (journalTransform opts journal)
              pure (Right (T.pack format))

dropExecutable :: [String] -> [String]
dropExecutable ("hledger" : rest) = rest
dropExecutable rest = rest

-- | Check parsed option names, not spellings, so short flags, aliases and
-- joined arguments cannot bypass the boundary. Parsing-related options still
-- run through native readJournalFiles on a temporary candidate.
refusedOptions :: RawOpts -> [String]
refusedOptions raw =
  filter (\name -> hasOpt name raw)
    [ "file", "rules", "output-file", "conf", "help", "man", "info", "tldr"
    , "version", "debug", "pager", "base-url", "new"
    ]

hasOpt :: String -> RawOpts -> Bool
hasOpt name raw = maybestringopt name raw /= Nothing
