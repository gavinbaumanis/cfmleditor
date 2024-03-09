import { CompletionEntry } from "../features/completionItemProvider";
import { DocumentStateContext } from "../utils/documentUtil";
import { TextDocument, Range } from "vscode";
import { getClosingPosition, getCfScriptRanges } from "../utils/contextUtil";
import { parseTags, Tag } from "./tag";

export interface CatchPropertyDetails extends CompletionEntry {
  appliesToTypes?: string[];
}

export interface CatchProperties {
  [propertyName: string]: CatchPropertyDetails;
}

export const catchProperties: CatchProperties = {
  "type": {
    detail: "(property) Exception.type",
    description: "Type: Exception type."
  },
  "message": {
    detail: "(property) Exception.message",
    description: "Message: Exception’s diagnostic message, if provided; otherwise, an empty string."
  },
  "detail": {
    detail: "(property) Exception.detail",
    description: "Detailed message from the CFML interpreter or specified in a cfthrow tag. When the exception is generated by ColdFusion (and not cfthrow), the message can contain HTML formatting and can help determine which tag threw the exception."
  },
  "tagContext": {
    detail: "(property) Exception.tagContext",
    description: "An array of tag context structures, each representing one level of the active tag context at the time of the exception."
  },
  "nativeErrorCode": {
    detail: "(property) Exception.nativeErrorCode",
    description: "Applies to type=\"database\". Native error code associated with exception. Database drivers typically provide error codes to diagnose failing database operations. Default value is -1.",
    appliesToTypes: ["database"]
  },
  "sqlState": {
    detail: "(property) Exception.sqlState",
    description: "Applies to type=\"database\". SQLState associated with exception. Database drivers typically provide error codes to help diagnose failing database operations. Default value is -1.",
    appliesToTypes: ["database"]
  },
  "sql": {
    detail: "(property) Exception.sql",
    description: "Applies to type=\"database\". The SQL statement sent to the data source.",
    appliesToTypes: ["database"]
  },
  "queryError": {
    detail: "(property) Exception.queryError",
    description: "Applies to type=\"database\". The error message as reported by the database driver.",
    appliesToTypes: ["database"]
  },
  "where": {
    detail: "(property) Exception.where",
    description: "Applies to type=\"database\". If the query uses the cfqueryparam tag, query parameter name-value pairs.",
    appliesToTypes: ["database"]
  },
  "errNumber": {
    detail: "(property) Exception.errNumber",
    description: "Applies to type=\"expression\". Internal expression error number.",
    appliesToTypes: ["expression"]
  },
  "missingFileName": {
    detail: "(property) Exception.missingFileName",
    description: "Applies to type=\"missingInclude\". Name of file that could not be included.",
    appliesToTypes: ["missinginclude"]
  },
  "lockName": {
    detail: "(property) Exception.lockName",
    description: "Applies to type=\"lock\". Name of affected lock (if the lock is unnamed, the value is \"anonymous\").",
    appliesToTypes: ["lock"]
  },
  "lockOperation": {
    detail: "(property) Exception.lockOperation",
    description: "Applies to type=\"lock\". Operation that failed (Timeout, Create Mutex, or Unknown).",
    appliesToTypes: ["lock"]
  },
  "errorCode": {
    detail: "(property) Exception.errorCode",
    description: "Applies to type=\"custom\". String error code."
  },
  "extendedInfo": {
    detail: "(property) Exception.extendedInfo",
    description: "Applies to type=\"application\" and \"custom\". Custom error message; information that the default exception handler does not display.",
    appliesToTypes: ["application"]
  },
};

// Type is optional in Lucee
export const scriptCatchPattern: RegExp = /\}\s*catch\s*\(\s*([A-Za-z0-9_.$]+)\s+([_$a-zA-Z][$\w]*)\s*\)\s*\{/gi;

export interface CatchInfo {
  type: string;
  variableName: string;
  bodyRange: Range;
}

/**
 * Parses the catches in the document and returns an array of catch information
 * @param documentStateContext The context information for a TextDocument in which to parse the CFScript functions
 * @param isScript Whether this document or range is defined entirely in CFScript
 * @param docRange Range within which to check
 * @returns
 */
export function parseCatches(documentStateContext: DocumentStateContext, isScript: boolean, docRange?: Range): CatchInfo[] {
  let catchInfoArr: CatchInfo[] = [];
  const document: TextDocument = documentStateContext.document;
  let textOffset: number = 0;
  let documentText: string = documentStateContext.sanitizedDocumentText;

  if (docRange && document.validateRange(docRange)) {
    textOffset = document.offsetAt(docRange.start);
    documentText = documentText.slice(textOffset, document.offsetAt(docRange.end));
  }

  if (isScript) {
    let scriptCatchMatch: RegExpExecArray = null;
    // eslint-disable-next-line no-cond-assign
    while (scriptCatchMatch = scriptCatchPattern.exec(documentText)) {
      const catchType = scriptCatchMatch[1] ? scriptCatchMatch[1] : "any";
      const catchVariable = scriptCatchMatch[2];

      const catchBodyStartOffset = textOffset + scriptCatchMatch.index + scriptCatchMatch[0].length;
      const catchBodyEndPosition = getClosingPosition(documentStateContext, catchBodyStartOffset, "}");

      const catchBodyRange: Range = new Range(
        document.positionAt(catchBodyStartOffset),
        catchBodyEndPosition.translate(0, -1)
      );

      const catchInfo: CatchInfo = {
        type: catchType,
        variableName: catchVariable,
        bodyRange: catchBodyRange
      };

      catchInfoArr.push(catchInfo);
    }
  } else {
    const tagName: string = "cfcatch";
    const tags: Tag[] = parseTags(documentStateContext, tagName, docRange);

    tags.forEach((tag: Tag) => {
      if (tag.bodyRange === undefined) {
        return;
      }

      let catchType: string = "any";
      let catchVariable: string = tagName;

      if (tag.attributes.has("type")) {
        catchType = tag.attributes.get("type").value;
      }

      if (tag.attributes.has("name")) {
        catchVariable = tag.attributes.get("name").value;
      }

      const catchInfo: CatchInfo = {
        type: catchType,
        variableName: catchVariable,
        bodyRange: tag.bodyRange
      };

      catchInfoArr.push(catchInfo);
    });

    // Check cfscript sections
    const cfScriptRanges: Range[] = getCfScriptRanges(document, docRange);
    cfScriptRanges.forEach((range: Range) => {
      const cfscriptCatches: CatchInfo[] = parseCatches(documentStateContext, true, range);

      catchInfoArr = catchInfoArr.concat(cfscriptCatches);
    });
  }

  return catchInfoArr;
}
