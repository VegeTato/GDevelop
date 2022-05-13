// @flow
import * as React from 'react';
import { TreeView, TreeItem } from '@material-ui/lab';
import ChevronRight from '@material-ui/icons/ChevronRight';
import ExpandMore from '@material-ui/icons/ExpandMore';
import Add from '@material-ui/icons/Add';
import SwapHorizontal from '@material-ui/icons/SwapHoriz';
import Copy from '../UI/CustomSvgIcons/Copy';
import Undo from '@material-ui/icons/Undo';
import Close from '@material-ui/icons/Close';
import Redo from '@material-ui/icons/Redo';
import Paste from '../UI/CustomSvgIcons/Paste';
import Delete from '@material-ui/icons/Delete';
import { mapFor } from '../Utils/MapFor';
import SemiControlledTextField from '../UI/SemiControlledTextField';
import { Column, Line, Spacer } from '../UI/Grid';
import DragHandle from '../UI/DragHandle';
import useForceUpdate from '../Utils/UseForceUpdate';
import { Trans, t } from '@lingui/macro';
import { makeDragSourceAndDropTarget } from '../UI/DragAndDrop/DragSourceAndDropTarget';
import DropIndicator from '../UI/SortableVirtualizedItemList/DropIndicator';
import VariableTypeSelector from './VariableTypeSelector';
import IconButton from '../UI/IconButton';
import { makeStyles, withStyles } from '@material-ui/styles';
import styles from './styles';
import newNameGenerator from '../Utils/NewNameGenerator';
import Measure from 'react-measure';
import FlatButton from '../UI/FlatButton';
import Clipboard, { SafeExtractor } from '../Utils/Clipboard';
import { CLIPBOARD_KIND } from './ClipboardKind';
import {
  serializeToJSObject,
  unserializeFromJSObject,
} from '../Utils/Serializer';
import { EmptyPlaceholder } from '../UI/EmptyPlaceholder';
import ScrollView from '../UI/ScrollView';
import GDevelopThemeContext from '../UI/Theme/ThemeContext';
import TextField from '../UI/TextField';
import { ResponsiveLineStackLayout } from '../UI/Layout';
import KeyboardShortcuts from '../UI/KeyboardShortcuts';
import SemiControlledAutoComplete from '../UI/SemiControlledAutoComplete';
import {
  type HistoryState,
  undo,
  redo,
  canUndo,
  canRedo,
  getHistoryInitialState,
  saveToHistory,
} from '../Utils/History';
const gd: libGDevelop = global.gd;

const stopEventPropagation = (event: SyntheticPointerEvent<HTMLInputElement>) =>
  event.stopPropagation();
const preventEventDefaultEffect = (
  event: SyntheticPointerEvent<HTMLInputElement>
) => event.preventDefault();

const hasChildThatContainsStringInNameAndValue = (
  variable: gdVariable,
  searchText: string
): boolean => {
  switch (variable.getType()) {
    case gd.Variable.String:
      return variable
        .getString()
        .normalize('NFD')
        .toLowerCase()
        .includes(searchText);
    case gd.Variable.Number:
      return variable
        .getValue()
        .toString()
        .includes(searchText);
    case gd.Variable.Array:
      return mapFor(0, variable.getChildrenCount(), index => {
        const childVariable = variable.getAtIndex(index);
        return hasChildThatContainsStringInNameAndValue(
          childVariable,
          searchText
        );
      }).some(Boolean);
    case gd.Variable.Structure:
      return variable
        .getAllChildrenNames()
        .toJSArray()
        .map(childName => {
          const childVariable = variable.getChild(childName);
          return (
            childName
              .normalize('NFD')
              .toLowerCase()
              .includes(searchText) ||
            hasChildThatContainsStringInNameAndValue(childVariable, searchText)
          );
        })
        .some(Boolean);
    default:
      return false;
  }
};

type Props = {
  variablesContainer: gdVariablesContainer,
  inheritedVariablesContainer?: gdVariablesContainer,
  onComputeAllVariableNames?: () => Array<string>,
};

const getExpandedNodeIdsFromVariables = (
  variables: { name: string, variable: gdVariable }[],
  accumulator: string[],
  parentNodeId: string = ''
): string[] => {
  let newAccumulator = [];
  for (const { name, variable } of variables) {
    const nodeId = parentNodeId ? `${parentNodeId}.${name}` : name;
    if (!variable.isFolded() && variable.getChildrenCount() > 0) {
      newAccumulator.push(nodeId);
    }
    if (variable.getType() === gd.Variable.Array) {
      const children = mapFor(0, variable.getChildrenCount(), index => ({
        name: index.toString(),
        variable: variable.getAtIndex(index),
      }));
      newAccumulator = [
        ...newAccumulator,
        ...getExpandedNodeIdsFromVariables(children, newAccumulator, nodeId),
      ];
    } else if (variable.getType() === gd.Variable.Structure) {
      const children = variable
        .getAllChildrenNames()
        .toJSArray()
        .map((childName, index) => ({
          variable: variable.getChild(childName),
          name: childName,
        }));
      newAccumulator = [
        ...newAccumulator,
        ...getExpandedNodeIdsFromVariables(children, newAccumulator, nodeId),
      ];
    }
  }
  return newAccumulator;
};

const getExpandedNodeIdsFromVariablesContainer = (
  variablesContainer: gdVariablesContainer,
  isInherited: boolean = false
): string[] => {
  const variables = [];
  for (let index = 0; index < variablesContainer.count(); index += 1) {
    variables.push({
      name: `${
        isInherited ? inheritedPrefix : ''
      }${variablesContainer.getNameAt(index)}`,
      variable: variablesContainer.getAt(index),
    });
  }
  return getExpandedNodeIdsFromVariables(variables, []);
};

const foldNodesVariables = (
  variablesContainer: gdVariablesContainer,
  nodes: string[],
  fold: boolean
) => {
  nodes.forEach(nodeId => {
    const { variable } = getVariableContextFromNodeId(
      nodeId,
      variablesContainer
    );
    if (variable) {
      variable.setFolded(fold);
    }
  });
};

const StyledTreeItem = withStyles(theme => ({
  group: {
    borderLeft: `1px solid black`,
    marginLeft: 7,
    paddingLeft: 15,
  },
  iconContainer: {
    alignSelf: 'stretch',
    alignItems: 'center',
    color: 'white',
  },
  root: {
    '&:focus:not(.Mui-selected)': {
      '& > .MuiTreeItem-content': {
        filter: 'brightness(0.85)',
      },
      '& > .MuiTreeItem-content > .MuiTreeItem-label': {
        backgroundColor: 'unset',
      },
    },
    '&:hover:not(:focus)': {
      '& > .MuiTreeItem-content:hover': {
        filter: 'brightness(0.93)',
      },
    },
    '&.Mui-selected:hover': {
      '& > .MuiTreeItem-content:hover': {
        filter: 'brightness(0.93)',
      },
    },
  },
  label: {
    padding: 0,
    '&:hover': {
      backgroundColor: 'unset',
    },
  },
  content: { marginTop: 5, backgroundColor: '#E4E4E4' },
}))(props => <TreeItem {...props} TransitionProps={{ timeout: 0 }} />);

const insertInVariablesContainer = (
  variablesContainer: gdVariablesContainer,
  name: string,
  serializedVariable: ?any,
  index: ?number
): string => {
  const newName = newNameGenerator(
    name,
    name => variablesContainer.has(name),
    serializedVariable ? 'CopyOf' : undefined
  );
  const newVariable = new gd.Variable();
  if (serializedVariable) {
    unserializeFromJSObject(newVariable, serializedVariable);
  } else {
    newVariable.setString('');
  }
  variablesContainer.insert(
    newName,
    newVariable,
    index || variablesContainer.count()
  );
  newVariable.delete();
  return newName;
};

const insertInVariableChildrenArray = (
  targetParentVariable: gdVariable,
  serializedVariable: any,
  index: number
) => {
  const newVariable = new gd.Variable();
  unserializeFromJSObject(newVariable, serializedVariable);
  targetParentVariable.insertInArray(newVariable, index);
  newVariable.delete();
};

const insertInVariableChildren = (
  targetParentVariable: gdVariable,
  name: string,
  serializedVariable: any
): string => {
  const newName = newNameGenerator(
    name,
    _name => targetParentVariable.hasChild(_name),
    'CopyOf'
  );
  const newVariable = new gd.Variable();
  unserializeFromJSObject(newVariable, serializedVariable);
  targetParentVariable.insertChild(newName, newVariable);
  newVariable.delete();
  return newName;
};

const getDirectParentVariable = lineage =>
  lineage[lineage.length - 1] ? lineage[lineage.length - 1].variable : null;
const getOldestAncestryVariable = lineage =>
  lineage.length ? lineage[0] : null;

const getVariableContextFromNodeId = (
  nodeId: string,
  variablesContainer: gdVariablesContainer
) => {
  const bits = nodeId.split('.');
  let parentVariable = null;
  let currentVariable = null;
  let currentVariableName = null;
  let lineage = [];
  let name = null;
  let depth = -1;

  while (depth < bits.length - 1) {
    depth += 1;
    currentVariableName = bits[depth];
    if (depth === 0 && currentVariableName.startsWith(inheritedPrefix)) {
      currentVariableName = removeInheritedPrefix(currentVariableName);
    }
    if (!parentVariable) {
      currentVariable = variablesContainer.get(currentVariableName);
    } else {
      if (parentVariable.getType() === gd.Variable.Array) {
        const index = parseInt(currentVariableName, 10);
        if (index >= parentVariable.getChildrenCount()) {
          return { variable: null, lineage, depth, name };
        }
        currentVariable = parentVariable.getAtIndex(index);
      } else {
        if (!parentVariable.hasChild(currentVariableName)) {
          return { variable: null, lineage, depth, name };
        }
        currentVariable = parentVariable.getChild(currentVariableName);
      }
    }
    if (depth < bits.length - 1) {
      lineage.push({
        nodeId: bits.slice(0, depth + 1).join('.'),
        name: currentVariableName,
        variable: currentVariable,
      });
    }
    parentVariable = currentVariable;
  }
  return {
    variable: currentVariable,
    name: currentVariableName,
    depth,
    lineage,
  };
};

const hasVariablesContainerSubChildren = (
  variablesContainer: gdVariablesContainer
): boolean =>
  mapFor(0, variablesContainer.count(), index => {
    const variable = variablesContainer.getAt(index);

    return isCollection(variable) && variable.getChildrenCount() > 0;
  }).some(Boolean);

type MovementType =
  | 'TopLevelToStructure'
  | 'InsideTopLevel'
  | 'StructureToTopLevel'
  | 'ArrayToTopLevel'
  | 'FromStructureToAnotherStructure'
  | 'InsideSameStructure'
  | 'FromArrayToAnotherArray'
  | 'InsideSameArray'
  | 'FromStructureToArray'
  | 'FromArrayToStructure';

const getMovementTypeWithinVariablesContainer = (
  draggedVariableContext,
  targetVariableContext
): ?MovementType => {
  const { lineage: targetVariableLineage } = targetVariableContext;
  const targetVariableParentVariable = getDirectParentVariable(
    targetVariableLineage
  );

  const { lineage: draggedVariableLineage } = draggedVariableContext;
  const draggedVariableParentVariable = getDirectParentVariable(
    draggedVariableLineage
  );

  if (!!draggedVariableParentVariable && !!targetVariableParentVariable) {
    if (
      targetVariableParentVariable.getType() === gd.Variable.Structure &&
      draggedVariableParentVariable.getType() === gd.Variable.Structure &&
      draggedVariableParentVariable !== targetVariableParentVariable
    )
      return 'FromStructureToAnotherStructure';
    if (
      targetVariableParentVariable.getType() === gd.Variable.Structure &&
      draggedVariableParentVariable === targetVariableParentVariable
    )
      return 'InsideSameStructure';
    if (
      targetVariableParentVariable.getType() === gd.Variable.Array &&
      draggedVariableParentVariable.getType() === gd.Variable.Array &&
      draggedVariableParentVariable !== targetVariableParentVariable
    )
      return 'FromArrayToAnotherArray';
    if (
      targetVariableParentVariable.getType() === gd.Variable.Array &&
      draggedVariableParentVariable === targetVariableParentVariable
    )
      return 'InsideSameArray';
    if (
      targetVariableParentVariable.getType() === gd.Variable.Array &&
      draggedVariableParentVariable.getType() === gd.Variable.Structure
    )
      return 'FromStructureToArray';
    if (
      targetVariableParentVariable.getType() === gd.Variable.Structure &&
      draggedVariableParentVariable.getType() === gd.Variable.Array
    )
      return 'FromArrayToStructure';
  }

  if (!draggedVariableParentVariable && !targetVariableParentVariable)
    return 'InsideTopLevel';
  if (
    !draggedVariableParentVariable &&
    !!targetVariableParentVariable &&
    targetVariableParentVariable.getType() === gd.Variable.Structure
  )
    return 'TopLevelToStructure';
  if (
    !!draggedVariableParentVariable &&
    !targetVariableParentVariable &&
    draggedVariableParentVariable.getType() === gd.Variable.Structure
  )
    return 'StructureToTopLevel';
  if (
    !!draggedVariableParentVariable &&
    !targetVariableParentVariable &&
    draggedVariableParentVariable.getType() === gd.Variable.Array
  )
    return 'ArrayToTopLevel';

  return null;
};

const inheritedPrefix = '$!';
const removeInheritedPrefix = (str: string): string =>
  str.slice(inheritedPrefix.length, str.length);
const isCollection = (variable: gdVariable): boolean =>
  !gd.Variable.isPrimitive(variable.getType());

const NewVariablesList = (props: Props) => {
  const [expandedNodes, setExpandedNodes] = React.useState<Array<string>>(
    getExpandedNodeIdsFromVariablesContainer(props.variablesContainer).concat(
      props.inheritedVariablesContainer
        ? getExpandedNodeIdsFromVariablesContainer(
            props.inheritedVariablesContainer,
            true
          )
        : []
    )
  );
  const [history, setHistory] = React.useState<HistoryState>(
    getHistoryInitialState(props.variablesContainer, {
      historyMaxSize: 50,
    })
  );
  const [searchText, setSearchText] = React.useState<string>('');
  const [allVariablesNames] = React.useState<?Array<string>>(
    props.onComputeAllVariableNames ? props.onComputeAllVariableNames() : null
  );
  const [selectedNodes, setSelectedNodes] = React.useState<Array<string>>([]);
  const [containerWidth, setContainerWidth] = React.useState<?number>(null);
  const [nameErrors, setNameErrors] = React.useState<{ [number]: React.Node }>(
    {}
  );
  const gdevelopTheme = React.useContext(GDevelopThemeContext);
  const draggedNodeId = React.useRef<?string>(null);
  const forceUpdate = useForceUpdate();

  const shouldHideExpandIcons =
    !hasVariablesContainerSubChildren(props.variablesContainer) &&
    (props.inheritedVariablesContainer
      ? !hasVariablesContainerSubChildren(props.inheritedVariablesContainer)
      : true);

  const useStylesForSelectedTreeItem = makeStyles(() => ({
    root: {
      '&.Mui-selected > .MuiTreeItem-content': {
        marginTop: 5,
        backgroundColor: gdevelopTheme.listItem.selectedBackgroundColor,
      },
      '&.Mui-selected > .MuiTreeItem-content > .MuiTreeItem-label': {
        backgroundColor: 'unset',
      },
      '&.isCollection > .MuiTreeItem-content > .MuiTreeItem-iconContainer': {
        backgroundColor: gdevelopTheme.listItem.selectedBackgroundColor,
      },
      '& > .MuiTreeItem-content > .MuiTreeItem-iconContainer': shouldHideExpandIcons
        ? {
            display: 'none',
          }
        : undefined,
    },
  }));

  const selectedTreeItemClasses = useStylesForSelectedTreeItem();

  const rowRightSideStyle = React.useMemo(
    () => ({
      minWidth: containerWidth ? Math.round(0.6 * containerWidth) : 600,
      flexShrink: 0,
    }),
    [containerWidth]
  );
  const isNarrow = containerWidth ? containerWidth < 600 : false;

  const undefinedVariableNames = allVariablesNames
    ? allVariablesNames
        .map(variableName => {
          if (!props.variablesContainer.has(variableName)) {
            return { text: variableName, value: variableName };
          }
          return null;
        })
        .filter(Boolean)
    : [];

  const _saveToHistory = () => {
    setHistory(saveToHistory(history, props.variablesContainer));
  };

  const _undo = () => {
    setHistory(undo(history, props.variablesContainer));
  };

  const _redo = () => {
    setHistory(redo(history, props.variablesContainer));
  };

  const keyboardShortcuts = new KeyboardShortcuts({
    isActive: () => true,
    shortcutCallbacks: { onUndo: _undo, onRedo: _redo },
  });

  const copySelection = () => {
    Clipboard.set(
      CLIPBOARD_KIND,
      selectedNodes
        .map(nodeId => {
          const { variable, name, lineage } = getVariableContextFromNodeId(
            nodeId,
            nodeId.startsWith(inheritedPrefix) &&
              props.inheritedVariablesContainer
              ? props.inheritedVariablesContainer
              : props.variablesContainer
          );
          if (!variable || !name) return null;
          let parentType;

          const parentVariable = getDirectParentVariable(lineage);
          if (!parentVariable) {
            parentType = gd.Variable.Structure;
          } else {
            parentType = parentVariable.getType();
          }
          return {
            name,
            serializedVariable: serializeToJSObject(variable),
            parentType,
          };
        })
        .filter(Boolean)
    );
    forceUpdate();
  };

  const pasteSelection = () => {
    if (!Clipboard.has(CLIPBOARD_KIND)) return;
    const newSelectedNodes = [];

    const clipboardContent = Clipboard.get(CLIPBOARD_KIND);
    const variablesContent = SafeExtractor.extractArray(clipboardContent);
    if (!variablesContent) return;

    let pastedElementOffsetIndex = 0;

    variablesContent.forEach(variableContent => {
      const name = SafeExtractor.extractStringProperty(variableContent, 'name');
      const serializedVariable = SafeExtractor.extractObjectProperty(
        variableContent,
        'serializedVariable'
      );
      const parentType = SafeExtractor.extractNumberProperty(
        variableContent,
        'parentType'
      );
      if (!name || !serializedVariable || !parentType) return;

      const pasteAtTopLevel = selectedNodes.length === 0;

      if (pasteAtTopLevel) {
        if (parentType === gd.Variable.Array) return;
        const newName = insertInVariablesContainer(
          props.variablesContainer,
          name,
          serializedVariable
        );
        newSelectedNodes.push(newName);
      } else {
        const targetNode = selectedNodes[0];
        if (targetNode.startsWith(inheritedPrefix)) return;
        const {
          name: targetVariableName,
          lineage: targetVariableLineage,
        } = getVariableContextFromNodeId(targetNode, props.variablesContainer);
        if (!targetVariableName) return;
        const targetParentVariable = getDirectParentVariable(
          targetVariableLineage
        );
        if (!targetParentVariable) {
          if (parentType === gd.Variable.Array) return;
          const newName = insertInVariablesContainer(
            props.variablesContainer,
            name,
            serializedVariable,
            props.variablesContainer.getPosition(targetVariableName) + 1
          );
          newSelectedNodes.push(newName);
        } else {
          const targetParentType = targetParentVariable.getType();
          if (targetParentType !== parentType) return;
          if (targetParentType === gd.Variable.Array) {
            const index = parseInt(targetVariableName, 10) + 1;
            insertInVariableChildrenArray(
              targetParentVariable,
              serializedVariable,
              index
            );
            const bits = targetNode.split('.');
            bits.splice(
              bits.length - 1,
              1,
              (index + pastedElementOffsetIndex).toString()
            );

            newSelectedNodes.push(bits.join('.'));
            pastedElementOffsetIndex += 1;
          } else {
            const newName = insertInVariableChildren(
              targetParentVariable,
              name,
              serializedVariable
            );
            const bits = targetNode.split('.');
            bits.splice(bits.length - 1, 1, newName);
            newSelectedNodes.push(bits.join('.'));
          }
        }
      }
    });
    _saveToHistory();
    setSelectedNodes(newSelectedNodes);
  };

  const deleteSelection = () => {
    let hasBeenDeleted = false;
    selectedNodes.forEach(nodeId => {
      if (nodeId.startsWith(inheritedPrefix)) return;
      const { name, lineage } = getVariableContextFromNodeId(
        nodeId,
        props.variablesContainer
      );
      if (!name) return;
      const parentVariable = getDirectParentVariable(lineage);
      if (!parentVariable) {
        props.variablesContainer.remove(name);
      } else {
        if (parentVariable.getType() === gd.Variable.Array) {
          parentVariable.removeAtIndex(parseInt(name, 10));
        } else {
          parentVariable.removeChild(name);
        }
      }
      hasBeenDeleted = true;
    });
    if (hasBeenDeleted) {
      _saveToHistory();
      setSelectedNodes([]);
    }
  };

  const updateExpandedAndSelectedNodes = (nodeId: string, newName: string) => {
    [
      [expandedNodes, setExpandedNodes],
      [selectedNodes, setSelectedNodes],
    ].forEach(([list, setter]) => {
      const newList: Array<string> = [...list];
      const indexOfRenamedNode = newList.indexOf(nodeId);
      if (indexOfRenamedNode === -1) return;
      const indicesOfChildrenOfRenamedNode = newList
        .map(otherNodeId => {
          if (otherNodeId.startsWith(`${nodeId}.`)) {
            return newList.indexOf(otherNodeId);
          }
          return null;
        })
        .filter(Boolean);
      const originalNodeIdBits = nodeId.split('.');
      const variableName = originalNodeIdBits[originalNodeIdBits.length - 1];
      [indexOfRenamedNode, ...indicesOfChildrenOfRenamedNode].forEach(index => {
        const nodeIdToChange = newList[index];
        const bitsToChange = nodeIdToChange.split('.');
        bitsToChange[bitsToChange.indexOf(variableName)] = newName;
        newList.splice(index, 1, bitsToChange.join('.'));
      });
      setter(newList);
    });
  };

  const DragSourceAndDropTarget = React.useMemo(
    () => makeDragSourceAndDropTarget('variable-editor'),
    []
  );

  const canDrop = (nodeId: string): boolean => {
    if (nodeId.startsWith(inheritedPrefix)) return false;
    const { current } = draggedNodeId;
    if (!current) return false;

    const targetVariableContext = getVariableContextFromNodeId(
      nodeId,
      props.variablesContainer
    );
    const { lineage: targetLineage } = targetVariableContext;

    const draggedVariableContext = getVariableContextFromNodeId(
      current,
      props.variablesContainer
    );
    const { variable: draggedVariable } = draggedVariableContext;

    const targetLineageVariables = targetLineage.map(
      context => context.variable
    );
    if (targetLineageVariables.includes(draggedVariable)) return false;

    const movementType = getMovementTypeWithinVariablesContainer(
      draggedVariableContext,
      targetVariableContext
    );

    switch (movementType) {
      case 'InsideTopLevel':
      case 'TopLevelToStructure':
      case 'StructureToTopLevel':
      case 'FromStructureToAnotherStructure':
      case 'FromArrayToAnotherArray':
      case 'InsideSameArray':
        return true;
      case 'FromStructureToArray':
      case 'FromArrayToStructure':
      case 'ArrayToTopLevel':
      case 'InsideSameStructure':
      default:
        return false;
    }
  };

  const dropNode = (nodeId: string): void => {
    if (nodeId.startsWith(inheritedPrefix)) return;
    const { current } = draggedNodeId;
    if (!current) return;

    // TODO: Add logic to copy dragged variable instead of moving it if Alt/Opt key is pressed
    // React-dnd keeps the focus when user is dragging so keyboard shortcut instance
    // cannot detect if the key is pressed while dragging. React-dnd has issues to
    // return event data about pressed keys when mouse is up.

    const targetVariableContext = getVariableContextFromNodeId(
      nodeId,
      props.variablesContainer
    );
    const { lineage: targetLineage, name: targetName } = targetVariableContext;
    const targetVariableParentVariable = getDirectParentVariable(targetLineage);
    if (!targetName) return;

    const draggedVariableContext = getVariableContextFromNodeId(
      current,
      props.variablesContainer
    );
    const {
      variable: draggedVariable,
      lineage: draggedLineage,
      name: draggedName,
    } = draggedVariableContext;
    const draggedVariableParentVariable = getDirectParentVariable(
      draggedLineage
    );
    if (!draggedVariable || !draggedName) return;

    const targetLineageVariables = targetLineage.map(
      context => context.variable
    );
    if (targetLineageVariables.includes(draggedVariable)) return;

    const movementType = getMovementTypeWithinVariablesContainer(
      draggedVariableContext,
      targetVariableContext
    );
    let newName;
    let draggedIndex;
    let targetIndex;
    let movementHasBeenMade = true;

    switch (movementType) {
      case 'InsideTopLevel':
        draggedIndex = props.variablesContainer.getPosition(draggedName);
        targetIndex = props.variablesContainer.getPosition(targetName);
        props.variablesContainer.move(
          draggedIndex,
          targetIndex > draggedIndex ? targetIndex - 1 : targetIndex
        );
        break;
      case 'TopLevelToStructure':
        newName = newNameGenerator(
          draggedName,
          // $FlowFixMe - Regarding movement type, we are confident that the variable will exist
          name => targetVariableParentVariable.hasChild(name),
          'CopyOf'
        );

        // $FlowFixMe - Regarding movement type, we are confident that the variable will exist
        targetVariableParentVariable.insertChild(newName, draggedVariable);

        props.variablesContainer.remove(draggedName);
        break;
      case 'StructureToTopLevel':
        newName = newNameGenerator(
          draggedName,
          name => props.variablesContainer.has(name),
          'CopyOf'
        );
        props.variablesContainer.insert(
          newName,
          draggedVariable,
          props.variablesContainer.getPosition(targetName)
        );

        // $FlowFixMe - Regarding movement type, we are confident that the variable will exist
        draggedVariableParentVariable.removeChild(draggedName);
        break;
      case 'FromStructureToAnotherStructure':
        newName = newNameGenerator(
          draggedName,
          // $FlowFixMe - Regarding movement type, we are confident that the variable will exist
          name => targetVariableParentVariable.hasChild(name),
          'CopyOf'
        );
        // $FlowFixMe - Regarding movement type, we are confident that the variable will exist
        targetVariableParentVariable.insertChild(newName, draggedVariable);

        // $FlowFixMe - Regarding movement type, we are confident that the variable will exist
        draggedVariableParentVariable.removeChild(draggedName);
        break;
      case 'FromArrayToAnotherArray':
        draggedIndex = parseInt(draggedName, 10);
        targetIndex = parseInt(targetName, 10);

        // $FlowFixMe - Regarding movement type, we are confident that the variable will exist
        targetVariableParentVariable.insertInArray(
          draggedVariable,
          targetIndex
        );

        // $FlowFixMe - Regarding movement type, we are confident that the variable will exist
        draggedVariableParentVariable.removeAtIndex(draggedIndex);
        break;
      case 'InsideSameArray':
        draggedIndex = parseInt(draggedName, 10);
        targetIndex = parseInt(targetName, 10);
        // $FlowFixMe - Regarding movement type, we are confident that the variable will exist
        targetVariableParentVariable.moveChildInArray(
          draggedIndex,
          targetIndex > draggedIndex ? targetIndex - 1 : targetIndex
        );
        break;
      case 'FromStructureToArray':
      case 'FromArrayToStructure':
      case 'ArrayToTopLevel':
      case 'InsideSameStructure':
      default:
        movementHasBeenMade = false;
    }
    if (movementHasBeenMade) {
      _saveToHistory();
      forceUpdate();
    }
  };

  const onAddChild = (nodeId: string) => {
    if (nodeId.startsWith(inheritedPrefix)) return;
    const { variable } = getVariableContextFromNodeId(
      nodeId,
      props.variablesContainer
    );
    if (!variable || !isCollection(variable)) return;
    const type = variable.getType();

    if (type === gd.Variable.Structure) {
      const name = newNameGenerator('ChildVariable', name =>
        variable.hasChild(name)
      );
      variable.getChild(name).setString('');
    } else if (type === gd.Variable.Array) variable.pushNew();
    _saveToHistory();
    setExpandedNodes([...expandedNodes, nodeId]);
  };

  const onAdd = () => {
    const addAtTopLevel =
      selectedNodes.length === 0 ||
      selectedNodes.some(node => node.startsWith(inheritedPrefix));

    if (addAtTopLevel) {
      const newName = insertInVariablesContainer(
        props.variablesContainer,
        'Variable',
        null,
        props.variablesContainer.count()
      );
      _saveToHistory();
      setSelectedNodes([newName]);
      return;
    }

    const targetNode = selectedNodes[0];
    const {
      name: targetVariableName,
      lineage: targetLineage,
    } = getVariableContextFromNodeId(targetNode, props.variablesContainer);
    if (!targetVariableName) return;
    const oldestAncestry = getOldestAncestryVariable(targetLineage);
    let position;
    if (!oldestAncestry) {
      position = props.variablesContainer.getPosition(targetVariableName) + 1;
    } else {
      position = props.variablesContainer.getPosition(oldestAncestry.name) + 1;
    }
    const newName = insertInVariablesContainer(
      props.variablesContainer,
      'Variable',
      null,
      position
    );
    _saveToHistory();
    setSelectedNodes([newName]);
  };

  const renderVariableAndChildrenRows = ({
    name,
    variable,
    parentNodeId,
    parentVariable,
    isInherited,
  }: {|
    name: string,
    variable: gdVariable,
    parentNodeId?: string,
    parentVariable?: gdVariable,
    isInherited: boolean,
  |}) => {
    const type = variable.getType();
    const isCollection = !gd.Variable.isPrimitive(type);

    let parentType = null;
    let nodeId;
    const isTopLevel = !parentNodeId;
    const depth = parentNodeId ? parentNodeId.split('.').length : 0;
    const shouldWrap = !containerWidth
      ? false
      : containerWidth <= 750
      ? depth >= 5
      : containerWidth <= 850
      ? depth >= 6
      : containerWidth <= 950
      ? depth >= 7
      : depth >= 8;

    if (!parentNodeId) {
      if (isInherited) {
        nodeId = `${inheritedPrefix}${name}`;
      } else {
        nodeId = name;
      }
    } else {
      nodeId = `${parentNodeId}.${name}`;
    }
    if (!!parentVariable) {
      parentType = parentVariable.getType();
    }
    const isSelected = selectedNodes.includes(nodeId);
    const overwritesInheritedVariable =
      !isInherited &&
      props.inheritedVariablesContainer &&
      props.inheritedVariablesContainer.has(name);

    if (
      !!searchText &&
      !name
        .normalize('NFD')
        .toLowerCase()
        .includes(searchText.toLowerCase()) &&
      !hasChildThatContainsStringInNameAndValue(
        variable,
        searchText.toLowerCase()
      )
    ) {
      return null;
    }

    return (
      <DragSourceAndDropTarget
        key={variable.ptr}
        beginDrag={() => {
          draggedNodeId.current = nodeId;
          return {};
        }}
        canDrag={() => !isInherited}
        canDrop={() => canDrop(nodeId)}
        drop={() => {
          dropNode(nodeId);
        }}
      >
        {({ connectDragSource, connectDropTarget, isOver, canDrop }) => (
          <StyledTreeItem
            nodeId={nodeId}
            className={
              isCollection && variable.getChildrenCount() > 0
                ? 'isCollection'
                : ''
            }
            classes={selectedTreeItemClasses}
            label={connectDropTarget(
              <div>
                {isOver && <DropIndicator canDrop={canDrop} />}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    padding: isNarrow ? '4px 4px 4px 0px' : '6px 30px 6px 6px',
                  }}
                >
                  {isInherited ? (
                    <span style={{ width: 24 }} />
                  ) : (
                    connectDragSource(
                      <span>
                        <DragHandle
                          color={
                            isSelected
                              ? gdevelopTheme.listItem.selectedTextColor
                              : '#AAA'
                          }
                        />
                      </span>
                    )
                  )}
                  <ResponsiveLineStackLayout
                    expand
                    noMargin
                    width={isNarrow || shouldWrap ? 'small' : undefined}
                  >
                    <Line alignItems="center" noMargin expand>
                      <Spacer />
                      <SemiControlledAutoComplete
                        fullWidth
                        dataSource={isTopLevel ? undefinedVariableNames : []}
                        margin="none"
                        key="name"
                        disabled={
                          isInherited || parentType === gd.Variable.Array
                        }
                        onClick={stopEventPropagation}
                        errorText={nameErrors[variable.ptr]}
                        onChange={newValue => {
                          onChangeName(nodeId, newValue);
                          if (nameErrors[variable.ptr]) {
                            const newNameErrors = { ...nameErrors };
                            delete newNameErrors[variable.ptr];
                            setNameErrors(newNameErrors);
                          }
                          forceUpdate();
                        }}
                        inputStyle={{
                          color: isSelected
                            ? gdevelopTheme.listItem.selectedTextColor
                            : gdevelopTheme.listItem.textColor,
                          fontStyle: overwritesInheritedVariable
                            ? 'italic'
                            : undefined,
                        }}
                        value={name}
                        onBlur={event => {
                          onChangeName(nodeId, event.currentTarget.value);
                          if (nameErrors[variable.ptr]) {
                            const newNameErrors = { ...nameErrors };
                            delete newNameErrors[variable.ptr];
                            setNameErrors(newNameErrors);
                          }
                          forceUpdate();
                        }}
                      />
                      <Spacer />
                      <Spacer />
                    </Line>
                    <div style={shouldWrap ? undefined : rowRightSideStyle}>
                      <Line noMargin alignItems="center">
                        <Column noMargin>
                          <VariableTypeSelector
                            variableType={type}
                            onChange={newType => {
                              onChangeType(nodeId, newType);
                              forceUpdate();
                            }}
                            isHighlighted={isSelected}
                            disabled={isInherited}
                          />
                        </Column>
                        <Column expand>
                          {type === gd.Variable.Boolean ? (
                            <Line noMargin>
                              <span
                                style={
                                  isSelected
                                    ? {
                                        color:
                                          gdevelopTheme.listItem
                                            .selectedTextColor,
                                      }
                                    : undefined
                                }
                              >
                                {variable.getBool() ? (
                                  <Trans>True</Trans>
                                ) : (
                                  <Trans>False</Trans>
                                )}
                              </span>
                              {isInherited && !isTopLevel ? null : (
                                <>
                                  <Spacer />
                                  <IconButton
                                    size="small"
                                    style={{ padding: 0 }}
                                    onClick={() => {
                                      onChangeValue(
                                        nodeId,
                                        !variable.getBool() ? 'true' : 'false'
                                      );
                                    }}
                                  >
                                    <SwapHorizontal
                                      htmlColor={
                                        isSelected
                                          ? gdevelopTheme.listItem
                                              .selectedTextColor
                                          : undefined
                                      }
                                    />
                                  </IconButton>
                                </>
                              )}
                            </Line>
                          ) : (
                            <SemiControlledTextField
                              margin="none"
                              type={
                                type === gd.Variable.Number ? 'number' : 'text'
                              }
                              key="value"
                              onClick={stopEventPropagation}
                              multiline={type === gd.Variable.String}
                              inputStyle={{
                                ...(type === gd.Variable.String
                                  ? styles.noPaddingMultilineTextField
                                  : undefined),
                                ...(isSelected
                                  ? {
                                      color:
                                        gdevelopTheme.listItem
                                          .selectedTextColor,
                                    }
                                  : undefined),
                              }}
                              disabled={
                                isCollection || (isInherited && !isTopLevel)
                              }
                              onChange={() => {}}
                              value={
                                isCollection
                                  ? `${variable.getChildrenCount()} children`
                                  : type === gd.Variable.String
                                  ? variable.getString()
                                  : variable.getValue().toString()
                              }
                              commitOnBlur
                              onBlur={event => {
                                onChangeValue(
                                  nodeId,
                                  event.currentTarget.value
                                );
                                forceUpdate();
                              }}
                            />
                          )}
                        </Column>
                        {isCollection && !isInherited ? (
                          <IconButton
                            size="small"
                            style={{ padding: 0 }}
                            onClick={() => onAddChild(nodeId)}
                          >
                            <Add
                              htmlColor={
                                isSelected
                                  ? gdevelopTheme.listItem.selectedTextColor
                                  : undefined
                              }
                            />
                          </IconButton>
                        ) : null}
                      </Line>
                    </div>
                  </ResponsiveLineStackLayout>
                </div>
              </div>
            )}
            onLabelClick={preventEventDefaultEffect}
          >
            {!isCollection
              ? null
              : type === gd.Variable.Structure
              ? variable
                  .getAllChildrenNames()
                  .toJSArray()
                  .map((childName, index) => {
                    const childVariable = variable.getChild(childName);
                    return renderVariableAndChildrenRows({
                      name: childName,
                      variable: childVariable,
                      parentNodeId: nodeId,
                      parentVariable: variable,
                      isInherited,
                    });
                  })
              : mapFor(0, variable.getChildrenCount(), index => {
                  const childVariable = variable.getAtIndex(index);
                  return renderVariableAndChildrenRows({
                    name: index.toString(),
                    variable: childVariable,
                    parentNodeId: nodeId,
                    parentVariable: variable,
                    isInherited,
                  });
                })}
          </StyledTreeItem>
        )}
      </DragSourceAndDropTarget>
    );
  };

  const onChangeName = (nodeId: string, newName: ?string) => {
    const { variable, lineage, name } = getVariableContextFromNodeId(
      nodeId,
      props.variablesContainer
    );
    if (name === null) return;
    if (!newName) {
      if (variable) {
        setNameErrors({
          ...nameErrors,
          [variable.ptr]: <Trans>Variables cannot have empty names</Trans>,
        });
      }
      return;
    }

    if (newName === name) return;

    let hasBeenRenamed = false;
    const parentVariable = getDirectParentVariable(lineage);
    if (!parentVariable) {
      hasBeenRenamed = props.variablesContainer.rename(name, newName);
    } else {
      hasBeenRenamed = parentVariable.renameChild(name, newName);
    }
    if (hasBeenRenamed) {
      _saveToHistory();
      updateExpandedAndSelectedNodes(nodeId, newName);
    } else {
      if (variable)
        setNameErrors({
          ...nameErrors,
          [variable.ptr]: (
            <Trans>The variable name {newName} is already taken</Trans>
          ),
        });
    }
  };

  const onChangeType = (nodeId: string, newType: string) => {
    const { variable } = getVariableContextFromNodeId(
      nodeId,
      props.variablesContainer
    );
    if (!variable) return;
    variable.castTo(newType);
    _saveToHistory();
  };

  const onChangeValue = (nodeId: string, newValue: string) => {
    const isInherited = nodeId.startsWith(inheritedPrefix);
    let variable;
    if (isInherited && props.inheritedVariablesContainer) {
      const { variable: _variable, name, depth } = getVariableContextFromNodeId(
        nodeId,
        props.inheritedVariablesContainer
      );
      if (!name || !_variable || depth > 0) return;
      switch (_variable.getType()) {
        case gd.Variable.String:
          if (_variable.getString() === newValue) return;
          break;
        case gd.Variable.Number:
          const newValueAsFloat = parseFloat(newValue);
          if (newValueAsFloat === _variable.getValue()) return;
          break;
        case gd.Variable.Boolean:
          const newBool = newValue === 'true';
          if (newBool === _variable.getBool()) return;
          break;
        default:
      }
      const newVariable = new gd.Variable();
      unserializeFromJSObject(newVariable, serializeToJSObject(_variable));
      variable = props.variablesContainer.insert(name, newVariable, 0);
      const newSelectedNodes = [...selectedNodes];
      const isVariableSelected = newSelectedNodes.indexOf(nodeId) !== -1;
      if (isVariableSelected) {
        newSelectedNodes.splice(newSelectedNodes.indexOf(nodeId), 1, name);
        setSelectedNodes(newSelectedNodes);
      } else {
        setSelectedNodes([...newSelectedNodes, name]);
      }
      newVariable.delete();
    } else {
      const { variable: _variable } = getVariableContextFromNodeId(
        nodeId,
        props.variablesContainer
      );
      variable = _variable;
    }
    if (!variable) return;
    switch (variable.getType()) {
      case gd.Variable.String:
        if (variable.getString() === newValue) return;
        variable.setString(newValue);
        break;
      case gd.Variable.Number:
        const newValueAsFloat = parseFloat(newValue);
        if (newValueAsFloat === variable.getValue()) return;
        variable.setValue(newValueAsFloat);
        break;
      case gd.Variable.Boolean:
        const newBool = newValue === 'true';
        if (newBool === variable.getBool()) return;
        variable.setBool(newBool);
        break;
      default:
        console.error(
          `Cannot set variable with type ${variable.getType()} - are you sure it's a primitive type?`
        );
    }
    _saveToHistory();
    forceUpdate();
  };
  console.log(containerWidth);

  const renderTree = (inheritedVariables: boolean = false) => {
    const variablesContainer =
      inheritedVariables && props.inheritedVariablesContainer
        ? props.inheritedVariablesContainer
        : props.variablesContainer;
    const containerVariablesTree = mapFor(
      0,
      variablesContainer.count(),
      index => {
        const variable = variablesContainer.getAt(index);
        const name = variablesContainer.getNameAt(index);
        if (inheritedVariables) {
          if (props.variablesContainer.has(name)) {
            return null;
          }
        }

        return renderVariableAndChildrenRows({
          name,
          variable,
          isInherited: inheritedVariables,
        });
      }
    );
    return containerVariablesTree;
  };

  return (
    <Measure
      bounds
      onResize={contentRect => {
        setContainerWidth(contentRect.bounds.width);
      }}
    >
      {({ contentRect, measureRef }) => (
        <div
          style={{ flex: 1, display: 'flex' }}
          onKeyDown={keyboardShortcuts.onKeyDown}
          onKeyUp={keyboardShortcuts.onKeyUp}
        >
          <Column expand noMargin reverse={isNarrow}>
            <Line justifyContent="space-between" alignItems="center">
              <Column noMargin>
                <Line noMargin>
                  {isNarrow ? (
                    <IconButton
                      tooltip={t`Copy`}
                      onClick={copySelection}
                      size="small"
                      disabled={selectedNodes.length === 0}
                    >
                      <Copy />
                    </IconButton>
                  ) : (
                    <FlatButton
                      icon={<Copy />}
                      disabled={selectedNodes.length === 0}
                      label={<Trans>Copy</Trans>}
                      onClick={copySelection}
                    />
                  )}
                  <Spacer />
                  {isNarrow ? (
                    <IconButton
                      tooltip={t`Paste`}
                      onClick={pasteSelection}
                      size="small"
                      disabled={
                        !Clipboard.has(CLIPBOARD_KIND) ||
                        selectedNodes.some(nodeId =>
                          nodeId.startsWith(inheritedPrefix)
                        )
                      }
                    >
                      <Paste />
                    </IconButton>
                  ) : (
                    <FlatButton
                      icon={<Paste />}
                      label={<Trans>Paste</Trans>}
                      disabled={
                        !Clipboard.has(CLIPBOARD_KIND) ||
                        selectedNodes.some(nodeId =>
                          nodeId.startsWith(inheritedPrefix)
                        )
                      }
                      onClick={pasteSelection}
                    />
                  )}
                  <Spacer />
                  {isNarrow ? (
                    <IconButton
                      tooltip={t`Delete`}
                      onClick={deleteSelection}
                      size="small"
                      disabled={
                        selectedNodes.length === 0 ||
                        selectedNodes.some(nodeId =>
                          nodeId.startsWith(inheritedPrefix)
                        )
                      }
                    >
                      <Delete />
                    </IconButton>
                  ) : (
                    <FlatButton
                      icon={<Delete />}
                      label={<Trans>Delete</Trans>}
                      disabled={
                        selectedNodes.length === 0 ||
                        selectedNodes.some(nodeId =>
                          nodeId.startsWith(inheritedPrefix)
                        )
                      }
                      onClick={deleteSelection}
                    />
                  )}
                  {/* // TODO: Remove those buttons once tests are over */}
                  <Spacer />
                  {isNarrow ? (
                    <IconButton
                      tooltip={t`Undo`}
                      onClick={_undo}
                      size="small"
                      disabled={!canUndo(history)}
                    >
                      <Undo />
                    </IconButton>
                  ) : (
                    <FlatButton
                      icon={<Undo />}
                      label={<Trans>Undo</Trans>}
                      onClick={_undo}
                      disabled={!canUndo(history)}
                    />
                  )}
                  <Spacer />
                  {isNarrow ? (
                    <IconButton
                      tooltip={t`Redo`}
                      onClick={_redo}
                      size="small"
                      disabled={!canRedo(history)}
                    >
                      <Redo />
                    </IconButton>
                  ) : (
                    <FlatButton
                      icon={<Redo />}
                      label={<Trans>Redo</Trans>}
                      onClick={_redo}
                      disabled={!canRedo(history)}
                    />
                  )}
                </Line>
              </Column>
              <Column expand>
                <TextField
                  fullWidth
                  value={searchText}
                  onChange={(event, value) => setSearchText(value)}
                  endAdornment={
                    !!searchText ? (
                      <IconButton onClick={() => setSearchText('')} edge="end">
                        <Close />
                      </IconButton>
                    ) : null
                  }
                  hintText={t`Search in variables`}
                />
              </Column>
              <Column noMargin>
                {isNarrow ? (
                  <IconButton
                    tooltip={t`Add variable`}
                    onClick={onAdd}
                    size="small"
                  >
                    <Add />
                  </IconButton>
                ) : (
                  <FlatButton
                    primary
                    onClick={onAdd}
                    label={<Trans>Add variable</Trans>}
                    icon={<Add />}
                  />
                )}
              </Column>
            </Line>
            {props.variablesContainer.count() === 0 ? (
              <Column noMargin expand justifyContent="center">
                <EmptyPlaceholder
                  title={<Trans>Add a variable</Trans>}
                  description={<Trans>Store data in variables.</Trans>}
                  actionLabel={<Trans>Add a variable</Trans>}
                  onAdd={onAdd}
                />
              </Column>
            ) : (
              <ScrollView autoHideScrollbar>
                <TreeView
                  ref={measureRef}
                  multiSelect
                  defaultExpandIcon={<ChevronRight />}
                  defaultCollapseIcon={<ExpandMore />}
                  onNodeSelect={(event, values) => setSelectedNodes(values)}
                  onNodeToggle={(event, values) => {
                    // Inherited variables should not be modified
                    const instanceExpandedNodes = expandedNodes.filter(
                      node => !node.startsWith(inheritedPrefix)
                    );
                    const instanceNewExpandedNodes = values.filter(
                      node => !node.startsWith(inheritedPrefix)
                    );
                    const foldedNodes = instanceExpandedNodes.filter(
                      node => !instanceNewExpandedNodes.includes(node)
                    );
                    const unfoldedNodes = instanceNewExpandedNodes.filter(
                      node => !instanceExpandedNodes.includes(node)
                    );
                    foldNodesVariables(
                      props.variablesContainer,
                      foldedNodes,
                      true
                    );
                    foldNodesVariables(
                      props.variablesContainer,
                      unfoldedNodes,
                      false
                    );
                    setExpandedNodes(values);
                  }}
                  selected={selectedNodes}
                  expanded={expandedNodes}
                >
                  {props.inheritedVariablesContainer ? renderTree(true) : null}
                  {renderTree()}
                </TreeView>
              </ScrollView>
            )}
          </Column>
        </div>
      )}
    </Measure>
  );
};

export default NewVariablesList;