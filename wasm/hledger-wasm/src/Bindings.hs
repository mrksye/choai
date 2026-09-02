-- choai — hledger journals in the browser
-- Copyright (C) 2026  choai contributors
--
-- Free software under the GNU General Public License, version 3 or later, and
-- distributed with no warranty of any kind. The full notice is in LICENSE at
-- the root of this repository, and at <https://www.gnu.org/licenses/>.

{-# LANGUAGE OverloadedStrings #-}

-- | What binds hledger to JavaScript.
--
-- hledger does the accounting; this module only makes it reachable from a
-- browser, and changes nothing about it. @foreign export javascript@ can be
-- written nowhere but in Haskell, and hledger-lib, being a library, has no entry
-- point of its own for a browser to call, so one thin layer has to exist. This
-- is that layer: it calls hledger's public API and nothing more.
--
-- It holds one piece of state, the parsed journal. Parse cost grows with the
-- size of the journal while answering a report from one already in memory does
-- not, so re-reading per screen would make that cost recur on every navigation.
--
-- Reports leave through hledger's own ToJSON instances rather than shapes
-- invented here, so the wire format is the one @hledger --output-format=json@
-- produces and follows hledger rather than drifting from it.
module Main (main) where

import Control.Exception (SomeException, displayException, try)
import Data.Aeson ((.:), (.:?), (.=))
import qualified Data.Aeson as A
import qualified Data.Aeson.Text as A (encodeToLazyText)
import qualified Data.Aeson.Types as A
import Data.IORef (IORef, newIORef, readIORef, writeIORef)
import Data.Text (Text)
import qualified Data.Text as T
import qualified Data.Text.Encoding as TE
import qualified Data.Text.Lazy as TL
import GHC.Wasm.Prim (JSString (..), fromJSString, toJSString)
import System.Directory (doesFileExist)
import System.IO.Unsafe (unsafePerformIO)

import Hledger
import Hledger.Data.Json ()

-- | Why a call did not produce an answer.
--
-- Carried as a tag and its particulars rather than a sentence, so the caller can
-- tell the cases apart and choose its own wording. A journal that failed to
-- parse and a query that was never a query are different situations.
data Failure
  = NoJournal
  | FileMissing FilePath
  | ReadFailed Text
  | MalformedRequest Text
  | UnknownReport Text
  | MissingTransaction
  | Crashed Text

failureJson :: Failure -> A.Value
failureJson failure = case failure of
  NoJournal -> tagged "no-journal" []
  FileMissing path -> tagged "file-missing" ["path" .= path]
  ReadFailed detail -> tagged "read-failed" ["detail" .= detail]
  MalformedRequest detail -> tagged "malformed-request" ["detail" .= detail]
  UnknownReport name -> tagged "unknown-report" ["report" .= name]
  MissingTransaction -> tagged "missing-transaction" []
  Crashed detail -> tagged "crashed" ["detail" .= detail]
  where
    tagged kind rest = A.object (("kind" .= (kind :: Text)) : rest)

-- | The journal, held across calls.
--
-- A reactor module lives as long as the page does, so a journal parsed once
-- stays parsed.
{-# NOINLINE journalRef #-}
journalRef :: IORef (Maybe Journal)
journalRef = unsafePerformIO (newIORef Nothing)

foreign export javascript "hledgerLoad" jsLoad :: JSString -> IO JSString
foreign export javascript "hledgerQuery" jsQuery :: JSString -> IO JSString

-- | Parse the journal at this path on the WASI filesystem and keep it.
--
-- The host writes journal files into the filesystem first. hledger resolves
-- @include@ directives against that same filesystem itself, so a journal split
-- across files needs no special handling on either side.
jsLoad :: JSString -> IO JSString
jsLoad path = respond (fmap (fmap summarise) (readAndKeep (fromJSString path)))

-- | Read a journal, distinguishing a file that is not there from one that is
-- there and wrong.
--
-- Existence is checked first because hledger calls @error@ for a missing file
-- rather than returning, which would otherwise reach the caller as a crash and
-- hide an ordinary, expected situation.
readAndKeep :: FilePath -> IO (Either Failure Journal)
readAndKeep path = do
  present <- doesFileExist (snd (splitReaderPrefix path))
  if not present
    then pure (Left (FileMissing path))
    else do
      result <- runExceptT (readJournalFile definputopts path)
      case result of
        Left detail -> pure (Left (ReadFailed (T.pack detail)))
        Right journal -> writeIORef journalRef (Just journal) >> pure (Right journal)

-- | What a caller needs to know about a journal without asking for a report.
--
-- The commodities are here so that a form offering to write a new entry can show
-- what the books are kept in. A bare number is a commodity of its own to
-- hledger, so someone typing one into yen books would quietly start a second
-- one, and nothing but the journal itself knows which symbol is meant.
--
-- The default commodity is the @D@ directive, and it is the one case where a
-- bare number is not a commodity of its own: hledger reads it as this one. A
-- form that writes the symbol out in full therefore changes nothing about what
-- the entry means, only about what the file says, which is the difference
-- between a journal that can be read by hand and one that cannot. Left out
-- when the journal declares no default, because then there is no symbol that
-- could be added without deciding something on the writer's behalf.
summarise :: Journal -> A.Value
summarise journal =
  A.object
    ( [ "transactions" .= length (jtxns journal)
      , "accounts" .= journalAccountNames journal
      , "commodities" .= journalCommoditiesUsed journal
      ]
        <> maybe [] (\declared -> ["defaultCommodity" .= defaultCommodityJson declared]) (jparsedefaultcommodity journal)
    )

-- | The @D@ directive as somebody writing an amount needs it.
--
-- Where the symbol goes is part of the answer and not a detail: @D 1000.00 EUR@
-- and @D $1,000.00@ are both defaults, and putting either on the wrong side of
-- the figure writes an amount hledger reads as a different commodity again.
-- The rest of the style — digit groups, decimal mark, precision — is how
-- hledger displays a figure, which is hledger's to do and not a form's.
defaultCommodityJson :: (CommoditySymbol, AmountStyle) -> A.Value
defaultCommodityJson (symbol, style) =
  A.object
    [ "symbol" .= symbol
    , "side" .= sideName (ascommodityside style)
    , "spaced" .= ascommodityspaced style
    ]

sideName :: Side -> Text
sideName L = "left"
sideName R = "right"

jsQuery :: JSString -> IO JSString
jsQuery raw = respond (runRequest (decodeRequest (fromJSString raw)))

decodeRequest :: String -> Either Failure Request
decodeRequest raw =
  case A.eitherDecodeStrict' (TE.encodeUtf8 (T.pack raw)) >>= A.parseEither parseRequest of
    Left detail -> Left (MalformedRequest (T.pack detail))
    Right request -> Right request

runRequest :: Either Failure Request -> IO (Either Failure A.Value)
runRequest (Left failure) = pure (Left failure)
runRequest (Right request) = do
  loaded <- readIORef journalRef
  case loaded of
    Nothing -> pure (Left NoJournal)
    Just journal -> report journal request

data Request = Request
  { reqKind :: Text
  -- ^ Which report to run.
  , reqQuery :: Text
  -- ^ A raw hledger query, eg @acct:expenses date:2024@. Passed through rather
  -- than reinvented: the people who use this already know the language, and
  -- hledger's own parser is the only thing that gets its meaning right.
  , reqLimit :: Maybe Int
  , reqOffset :: Int
  -- ^ A window onto the reports that have one row per item. Those reports are
  -- cheap to compute and expensive to serialise, so the caller takes a page at a
  -- time.
  , reqTransaction :: Maybe Transaction
  -- ^ For @renderTransaction@. hledger has FromJSON instances, so this accepts
  -- exactly the shape its own reports emit.
  , reqDescription :: Text
  -- ^ For @similar@: the description to find past transactions like.
  }

parseRequest :: A.Value -> A.Parser Request
parseRequest = A.withObject "request" $ \o ->
  Request
    <$> o .: "kind"
    <*> (maybe "" id <$> o .:? "query")
    <*> o .:? "limit"
    <*> (maybe 0 id <$> o .:? "offset")
    <*> o .:? "transaction"
    <*> (maybe "" id <$> o .:? "description")

-- | Run the report a request names.
--
-- The balance sheet, the income statement and the trial balance are the same
-- report under a different account-type filter, accumulation and listing, which
-- is how hledger's own @balancesheet@ and @incomestatement@ commands are
-- defined.
report :: Journal -> Request -> IO (Either Failure A.Value)
report journal request = case reqKind request of
  "entries" -> withSpec [] PerPeriod AsTree (\spec -> page request (entriesReport spec journal))
  "register" -> withSpec [] PerPeriod AsTree (\spec -> page request (postingsReport spec journal))
  "balance" -> withSpec [] PerPeriod AsTree (\spec -> A.toJSON (multiBalanceReport spec journal))
  "balancesheet" -> withSpec ["type:ALE"] Historical AsTree (\spec -> A.toJSON (multiBalanceReport spec journal))
  "incomestatement" -> withSpec ["type:RX"] PerPeriod AsTree (\spec -> A.toJSON (multiBalanceReport spec journal))
  -- Every account the books have, over no filter at all: the report a set of
  -- books is checked with rather than one of the statements they come to.
  "trialbalance" -> withSpec [] PerPeriod AsFlatWithEmpty (\spec -> trialBalance (multiBalanceReport spec journal))
  "accounts" -> pure (Right (A.toJSON (journalAccountNames journal)))
  -- What hledger takes each account to be, whether declared with an @account@
  -- directive or inferred from its name. Accounts it cannot place are simply
  -- absent, and those are the ones a balance sheet leaves out.
  "accountTypes" -> pure (Right (A.toJSON (jaccounttypes journal)))
  "renderTransaction" -> pure (renderTransaction request)
  "similar" -> pure (Right (similar journal request))
  other -> pure (Left (UnknownReport other))
  where
    withSpec extra accumulation listing render =
      fmap (fmap render) (specFor request extra accumulation listing)

-- | A trial balance: hledger's report, and the two columns it is read as.
--
-- A balance falls in one column or the other by its sign, and the whole of what
-- the report is for is that the two come to the same figure. So hledger adds
-- them up rather than whoever draws them: a total arrived at beside the books is
-- not the check the books are being put through.
--
-- Taken per commodity rather than per account, so books kept in more than one
-- currency put each of them in the column its own sign asks for.
trialBalance :: MultiBalanceReport -> A.Value
trialBalance found =
  A.object
    [ "report" .= A.toJSON found
    , "debits" .= A.toJSON (column (> 0))
    , "credits" .= A.toJSON (maNegate (column (< 0)))
    ]
  where
    column :: (Quantity -> Bool) -> MixedAmount
    column keep =
      maSum [mixedAmount a | row <- prRows found, a <- amounts (prrTotal row), keep (aquantity a)]

-- | Past transactions whose description resembles this one, most recent and
-- most alike first.
--
-- This is what @hledger add@ consults to offer the postings you used last time
-- for the same payee, so a caller filling in a new entry can offer the same
-- without inventing a notion of similarity of its own.
similar :: Journal -> Request -> A.Value
similar journal request =
  A.toJSON [transaction | (_, _, _, transaction) <- matches]
  where
    matches =
      journalTransactionsSimilarTo
        journal
        (reqDescription request)
        Any
        similarityThreshold
        (maybe 1 id (reqLimit request))

-- | How alike two descriptions must be to count, from 0 to 1.
--
-- Zero, which is what hledger passes from @Cli/Utils.hs@ when its own commands
-- look for the transaction to copy. Ranking is by similarity weighted towards
-- recent entries, so the threshold only decides what is excluded outright.
similarityThreshold :: Double
similarityThreshold = 0

-- | How a balance report lists the accounts it found.
--
-- A statement is a tree: its accounts are read as branches, and a parent
-- standing for everything beneath it is the point of one. A trial balance is a
-- flat list of every account there was, because its columns are added up — a
-- parent counted beside its own children would be counted twice — and because
-- an account that came to nothing is still an account the books have, which is
-- the sort of thing a check is run to see.
data Listing = AsTree | AsFlatWithEmpty

-- | Build the report specification, letting hledger parse the query.
specFor :: Request -> [Text] -> BalanceAccumulation -> Listing -> IO (Either Failure ReportSpec)
specFor request extra accumulation listing = do
  today <- getCurrentDay
  pure $ case reportOptsToSpec today options of
    Left detail -> Left (MalformedRequest (T.pack detail))
    Right spec -> Right spec
  where
    options =
      defreportopts
        { querystring_ = extra <> terms
        , balanceaccum_ = accumulation
        , accountlistmode_ = mode
        , empty_ = keepingEmpty
        }
    (mode, keepingEmpty) = case listing of
      AsTree -> (ALTree, False)
      AsFlatWithEmpty -> (ALFlat, True)
    terms = map T.pack (words' (T.unpack (reqQuery request)))

-- | Render a transaction back to journal syntax.
--
-- hledger writes it, so what is written to the file is what hledger would have
-- written.
renderTransaction :: Request -> Either Failure A.Value
renderTransaction request = case reqTransaction request of
  Nothing -> Left MissingTransaction
  Just transaction -> Right (A.toJSON (showTransaction transaction))

-- | Take a window of a report and say how many rows there were in all, so the
-- caller can page without asking again.
--
-- Newest first: a ledger is read from the recent end, and hledger's reports come
-- out oldest first.
page :: A.ToJSON a => Request -> [a] -> A.Value
page request rows =
  A.object
    [ "total" .= length rows
    , "offset" .= reqOffset request
    , "items" .= window (reverse rows)
    ]
  where
    window = maybe id take (reqLimit request) . drop (reqOffset request)

-- | Put a result in an envelope the host can branch on without guessing.
--
-- Exceptions are caught here rather than left to the runtime: an unsupported
-- WASI operation would otherwise abort the instance, and the page would have no
-- way to tell that apart from a query it got wrong.
respond :: IO (Either Failure A.Value) -> IO JSString
respond act = do
  result <- try act
  pure (encode (either (Left . crashed) id result))
  where
    crashed e = Crashed (T.pack (displayException (e :: SomeException)))

encode :: Either Failure A.Value -> JSString
encode outcome =
  toJSString . TL.unpack . A.encodeToLazyText $ case outcome of
    Right value -> A.object ["ok" .= True, "data" .= value]
    Left failure -> A.object ["ok" .= False, "error" .= failureJson failure]

main :: IO ()
main = pure ()
